CINDER MALL V4.1 — LOAD FIX

Root cause of the V4 loading failure:
The V4 storefront-clearance QA code called `storeEntries.push(...)` while constructing
the first storefront, but `storeEntries` had never been declared.

V4.1 declares that collection before map construction:
    const ... doors=[], storeEntries=[];

No map geometry was intentionally changed in this hotfix. This file is the V4 map with
the startup regression corrected.

The HTML still loads Three.js from cdnjs, as prior working prototypes did.
