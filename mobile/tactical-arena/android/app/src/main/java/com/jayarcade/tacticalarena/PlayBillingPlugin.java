package com.jayarcade.tacticalarena;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Minimal Google Play Billing bridge — one-time products only.
 *
 * Tactical Arena sells units, skins, skin packs and consumables. None of them are
 * subscriptions, so this deliberately implements only the INAPP slice of the Billing
 * Library rather than pulling in a general-purpose IAP plugin.
 *
 * Trust model: this bridge NEVER grants anything. It returns the purchase token to
 * JS, which posts it to platform-api; the server verifies the token with Google and
 * grants the entitlement. Only after the server confirms does JS call back into
 * acknowledge() or consume(). An unacknowledged purchase is auto-refunded by Google
 * after three days, which is the desired outcome if our server never confirmed it.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {

    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;

    private final PurchasesUpdatedListener purchasesUpdatedListener = (billingResult, purchases) -> {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) {
            return;
        }
        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("PURCHASE_CANCELLED", "cancelled");
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("PURCHASE_FAILED", String.valueOf(code));
            return;
        }
        JSArray results = new JSArray();
        for (Purchase purchase : purchases) {
            results.put(describePurchase(purchase));
        }
        JSObject result = new JSObject();
        result.put("purchases", results);
        call.resolve(result);
    };

    @Override
    public void load() {
        billingClient = BillingClient
            .newBuilder(getContext())
            .setListener(purchasesUpdatedListener)
            // Required from Billing Library 6+; one-time products only.
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    /** Runs `action` once the billing service is connected, rejecting `call` if it cannot be. */
    private void withConnection(PluginCall call, Runnable action) {
        if (billingClient == null) {
            call.reject("BILLING_UNAVAILABLE", "billing client not initialised");
            return;
        }
        if (billingClient.isReady()) {
            action.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    call.reject("BILLING_UNAVAILABLE", String.valueOf(billingResult.getResponseCode()));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Reconnection is handled lazily by the next withConnection() call.
            }
        });
    }

    private JSObject describePurchase(Purchase purchase) {
        JSObject item = new JSObject();
        item.put("purchaseToken", purchase.getPurchaseToken());
        item.put("orderId", purchase.getOrderId());
        item.put("acknowledged", purchase.isAcknowledged());
        item.put("purchaseState", purchase.getPurchaseState());
        JSArray ids = new JSArray();
        for (String id : purchase.getProducts()) {
            ids.put(id);
        }
        item.put("productIds", ids);
        return item;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", billingClient != null);
        call.resolve(result);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray requested = call.getArray("productIds", new JSArray());
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            for (Object id : requested.toList()) {
                products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(String.valueOf(id))
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build());
            }
        } catch (Exception error) {
            call.reject("BAD_REQUEST", "productIds must be an array of strings");
            return;
        }
        if (products.isEmpty()) {
            call.reject("BAD_REQUEST", "productIds is required");
            return;
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        withConnection(call, () -> billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("QUERY_FAILED", String.valueOf(billingResult.getResponseCode()));
                return;
            }
            JSArray list = new JSArray();
            for (ProductDetails details : productDetailsResult.getProductDetailsList()) {
                JSObject entry = new JSObject();
                entry.put("productId", details.getProductId());
                entry.put("title", details.getTitle());
                entry.put("description", details.getDescription());
                ProductDetails.OneTimePurchaseOfferDetails offer = details.getOneTimePurchaseOfferDetails();
                if (offer != null) {
                    entry.put("price", offer.getFormattedPrice());
                    entry.put("priceAmountMicros", offer.getPriceAmountMicros());
                    entry.put("currency", offer.getPriceCurrencyCode());
                }
                list.put(entry);
            }
            JSObject result = new JSObject();
            result.put("products", list);
            call.resolve(result);
        }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("BAD_REQUEST", "productId is required");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("PURCHASE_IN_PROGRESS", "another purchase is already running");
            return;
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(List.of(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()))
            .build();

        withConnection(call, () -> billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
            List<ProductDetails> details = productDetailsResult.getProductDetailsList();
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || details.isEmpty()) {
                call.reject("PRODUCT_NOT_FOUND", productId);
                return;
            }
            BillingFlowParams.Builder flowBuilder = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(List.of(BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details.get(0))
                    .build()));

            // Ties the purchase to the signed-in account for Play's fraud checks. JS sends a
            // SHA-256 of the player id, never the id itself, per Google's guidance; it is
            // absent when no account can be resolved, and the flow proceeds without it rather
            // than failing a legitimate sale.
            String obfuscatedAccountId = call.getString("obfuscatedAccountId");
            if (obfuscatedAccountId != null && !obfuscatedAccountId.isEmpty()) {
                flowBuilder.setObfuscatedAccountId(obfuscatedAccountId);
            }

            BillingFlowParams flowParams = flowBuilder.build();

            // Held so the PurchasesUpdatedListener can resolve it; the billing flow is
            // a separate activity and its result arrives on that callback, not here.
            pendingPurchaseCall = call;
            call.setKeepAlive(true);
            BillingResult launch = billingClient.launchBillingFlow(getActivity(), flowParams);
            if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                pendingPurchaseCall = null;
                call.reject("LAUNCH_FAILED", String.valueOf(launch.getResponseCode()));
            }
        }));
    }

    /** Durable goods (units, skins, packs): tell Google we granted it. */
    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null || token.isEmpty()) {
            call.reject("BAD_REQUEST", "purchaseToken is required");
            return;
        }
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(token)
            .build();
        withConnection(call, () -> billingClient.acknowledgePurchase(params, billingResult -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                call.resolve();
            } else {
                call.reject("ACKNOWLEDGE_FAILED", String.valueOf(billingResult.getResponseCode()));
            }
        }));
    }

    /** Consumables (Valor boosts, random-skin grants): consuming makes them re-purchasable. */
    @PluginMethod
    public void consume(PluginCall call) {
        String token = call.getString("purchaseToken");
        if (token == null || token.isEmpty()) {
            call.reject("BAD_REQUEST", "purchaseToken is required");
            return;
        }
        ConsumeParams params = ConsumeParams.newBuilder().setPurchaseToken(token).build();
        withConnection(call, () -> billingClient.consumeAsync(params, (billingResult, outToken) -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                call.resolve();
            } else {
                call.reject("CONSUME_FAILED", String.valueOf(billingResult.getResponseCode()));
            }
        }));
    }

    /**
     * Purchases Google knows about that we may not have granted yet — a purchase
     * completed while the app was killed, or one whose server grant failed. JS
     * re-submits these on boot so nothing is paid for but never delivered.
     */
    @PluginMethod
    public void getPendingPurchases(PluginCall call) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build();
        withConnection(call, () -> billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("QUERY_FAILED", String.valueOf(billingResult.getResponseCode()));
                return;
            }
            JSArray list = new JSArray();
            for (Purchase purchase : purchases) {
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    list.put(describePurchase(purchase));
                }
            }
            JSObject result = new JSObject();
            result.put("purchases", list);
            call.resolve(result);
        }));
    }
}
