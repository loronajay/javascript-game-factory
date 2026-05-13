const CANVAS_W = 960;
const CANVAS_H = 540;
const FRAME_W  = 16;
const FRAME_H  = 16;
const SPRITE_W = 48;
const SPRITE_H = 48;

export function createOnlineRenderer(ctx, images, {
  blit, drawSpaceBackground, drawRedButton, menuWalkFrame, drawOnlineLabel, formatIdentityLabel,
}) {
  function _drawSideCard(x, y, w, h, img, flipH, label, sublabel, keys, hovered, walkFrame) {
    ctx.save();
    ctx.fillStyle = hovered ? 'rgba(50,22,28,0.95)' : 'rgba(14,16,36,0.88)';
    ctx.fillRect(x, y, w, h);
    if (hovered) {
      ctx.shadowColor = 'rgba(220,60,80,0.75)';
      ctx.shadowBlur  = 22;
      ctx.strokeStyle = '#cc2a3a';
    } else {
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(88,108,180,0.55)';
    }
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;

    const sprX = Math.round(x + (w - SPRITE_W) / 2);
    const sprY = y + 38;
    blit(img, walkFrame, FRAME_W, FRAME_H, sprX, sprY, SPRITE_W, SPRITE_H, flipH, 1);

    const cx = x + w / 2;
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 22px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = hovered ? 'rgba(220,60,80,0.55)' : 'transparent';
    ctx.shadowBlur  = hovered ? 10 : 0;
    ctx.fillText(label, cx, sprY + SPRITE_H + 30);
    ctx.shadowBlur  = 0;
    ctx.font        = '13px "Cinzel Decorative", serif';
    ctx.fillStyle   = 'rgba(160,175,220,0.72)';
    ctx.fillText(sublabel, cx, sprY + SPRITE_H + 52);
    ctx.font        = 'bold 13px monospace';
    ctx.fillStyle   = hovered ? 'rgba(255,185,185,0.88)' : 'rgba(138,152,210,0.60)';
    ctx.fillText(keys, cx, sprY + SPRITE_H + 76);
    ctx.restore();
  }

  function _onlineEscHint(label) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '14px monospace';
    ctx.fillStyle = 'rgba(138,152,210,0.55)';
    ctx.fillText(label, CANVAS_W / 2, 520);
    ctx.restore();
  }

  function _otherSide(side) {
    return side === 'girl' ? 'boy' : 'girl';
  }

  function _getLobbyStatus(side, lobbyPhase) {
    const partner = _otherSide(side).toUpperCase();
    const locked  = `SIDE LOCKED: ${side.toUpperCase()}`;

    if (lobbyPhase === 'searching') {
      return {
        eyebrow: 'PUBLIC MATCHMAKING',
        status:  locked,
        detail:  `WAITING FOR ${partner} PLAYER`,
      };
    }

    if (lobbyPhase === 'friend_options') {
      return {
        eyebrow: 'PRIVATE ROOM OPTIONS',
        status:  locked,
        detail:  `CONNECT WITH A ${partner} PLAYER`,
      };
    }

    if (lobbyPhase === 'create') {
      return {
        eyebrow: 'PRIVATE ROOM',
        status:  locked,
        detail:  `WAITING FOR ${partner} PLAYER`,
      };
    }

    if (lobbyPhase === 'join') {
      return {
        eyebrow: 'JOIN PRIVATE ROOM',
        status:  locked,
        detail:  `ENTER A ROOM CODE FOR ${partner} PLAYER`,
      };
    }

    return {
      eyebrow: 'ONLINE READY',
      status:  locked,
      detail:  `MATCH WITH A ${partner} PLAYER`,
    };
  }

  function _getLobbyQueueLine(side, lobbyPhase, queueCounts) {
    if (!queueCounts || (lobbyPhase !== 'main' && lobbyPhase !== 'searching')) return null;

    const partnerSide = _otherSide(side);
    const count = queueCounts[partnerSide];
    if (!Number.isFinite(count)) return null;

    const rounded = Math.max(0, Math.floor(count));
    const noun    = partnerSide === 'boy'
      ? (rounded === 1 ? 'boy'  : 'boys')
      : (rounded === 1 ? 'girl' : 'girls');

    return `${rounded} ${noun} in the yard`;
  }

  function renderOnlineSideSelect(boyHovered, girlHovered, selectedSide = null) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    void selectedSide;
    drawOnlineLabel('ONLINE MATCHMAKING', CANVAS_W / 2, 26, {
      bg:        'rgba(18,28,56,0.86)',
      stroke:    'rgba(120,165,255,0.50)',
      textColor: 'rgba(220,232,255,0.95)',
    });

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 40px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.55)';
    ctx.shadowBlur  = 22;
    ctx.fillText('CHOOSE YOUR SIDE', CANVAS_W / 2, 94);
    ctx.restore();

    // cardW=220, cardH=240, gap=40 → startX=(960-480)/2=240
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '13px monospace';
    ctx.fillStyle = 'rgba(255,210,120,0.88)';
    ctx.fillText('YOUR SIDE STAYS LOCKED FOR THE MATCH', CANVAS_W / 2, 392);
    ctx.restore();
    _drawSideCard(240, 130, 220, 240, images.boy,  false, 'BOY',  'LEFT SIDE',  'W  A  S  D', boyHovered,  menuWalkFrame());
    _drawSideCard(500, 130, 220, 240, images.girl, true,  'GIRL', 'RIGHT SIDE', '←  ↑  ↓  →', girlHovered, menuWalkFrame());

    _onlineEscHint('ESC · BACK TO MENU');
  }

  function renderOnlineNameEntry(side, nameInput, errorText = '', hov = {}) {
    const label = formatIdentityLabel(side, { displayName: nameInput });

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    drawOnlineLabel('ONLINE PROFILE', CANVAS_W / 2, 26, {
      bg:        'rgba(18,28,56,0.86)',
      stroke:    'rgba(120,165,255,0.50)',
      textColor: 'rgba(220,232,255,0.95)',
    });

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 36px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.50)';
    ctx.shadowBlur  = 18;
    ctx.fillText('CHOOSE YOUR NAME', CANVAS_W / 2, 90);
    ctx.shadowBlur  = 0;
    ctx.font        = '14px monospace';
    ctx.fillStyle   = 'rgba(220,230,255,0.82)';
    ctx.fillText(`PLAYING AS ${side.toUpperCase()}`, CANVAS_W / 2, 118);
    ctx.fillStyle   = 'rgba(255,210,120,0.88)';
    ctx.fillText('12 CHARACTERS MAX', CANVAS_W / 2, 140);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '16px "Cinzel Decorative", serif';
    ctx.fillStyle = 'rgba(190,205,255,0.75)';
    ctx.fillText('Enter the name you want other players to see:', CANVAS_W / 2, 206);

    ctx.fillStyle = 'rgba(10,12,28,0.90)';
    ctx.fillRect(300, 228, 360, 56);
    const _nameCursorOn = Math.floor(Date.now() / 530) % 2 === 0;
    ctx.strokeStyle = errorText ? 'rgba(255,120,130,0.84)' : _nameCursorOn ? 'rgba(180,210,255,0.95)' : 'rgba(130,150,220,0.70)';
    ctx.lineWidth   = _nameCursorOn ? 2.5 : 2;
    ctx.strokeRect(300, 228, 360, 56);
    ctx.font      = 'bold 28px monospace';
    ctx.fillStyle = '#ffffff';
    const _nameWithCursor = (nameInput || '') + (_nameCursorOn ? '|' : ' ');
    ctx.fillText(_nameWithCursor, CANVAS_W / 2, 266);

    ctx.font      = '13px monospace';
    ctx.fillStyle = errorText ? 'rgba(255,150,150,0.96)' : 'rgba(150,170,225,0.72)';
    ctx.fillText(errorText || label, CANVAS_W / 2, 304);
    ctx.restore();

    drawRedButton(380, 336, 200, 52, 'CONTINUE', hov.continue, 18);
    _onlineEscHint('ESC · BACK');
  }

  function renderOnlineLobby(side, lobbyPhase, roomCode, codeInput, searchTick, hov, queueCounts = null, localIdentity = null, remoteIdentity = null) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();

    const img        = side === 'boy' ? images.boy  : images.girl;
    const flipH      = side === 'girl';
    const lobbyStatus = _getLobbyStatus(side, lobbyPhase);
    const queueLine   = _getLobbyQueueLine(side, lobbyPhase, queueCounts);

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 34px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.50)';
    ctx.shadowBlur  = 18;
    ctx.fillText('ONLINE MULTIPLAYER', CANVAS_W / 2, 72);
    ctx.shadowBlur  = 0;
    ctx.font        = 'bold 12px monospace';
    ctx.fillStyle   = 'rgba(255,210,120,0.92)';
    ctx.fillText(lobbyStatus.eyebrow, CANVAS_W / 2, 102);
    ctx.font        = '14px monospace';
    ctx.fillStyle   = 'rgba(220,230,255,0.86)';
    ctx.fillText(lobbyStatus.status, CANVAS_W / 2, 122);
    ctx.font        = '12px monospace';
    ctx.fillStyle   = 'rgba(150,170,225,0.78)';
    ctx.fillText(lobbyStatus.detail, CANVAS_W / 2, 142);
    if (queueLine) {
      ctx.fillStyle = 'rgba(255,210,120,0.78)';
      ctx.fillText(queueLine, CANVAS_W / 2, 162);
    }
    ctx.fillStyle = 'rgba(220,230,255,0.84)';
    ctx.fillText(`YOU: ${formatIdentityLabel(side, localIdentity)}`, CANVAS_W / 2, 182);
    if (remoteIdentity?.displayName) {
      ctx.fillStyle = 'rgba(255,210,120,0.82)';
      ctx.fillText(`PARTNER: ${formatIdentityLabel(_otherSide(side), remoteIdentity)}`, CANVAS_W / 2, 202);
    }
    ctx.restore();

    if      (lobbyPhase === 'main')           _renderLobbyMain(img, flipH, side, hov);
    else if (lobbyPhase === 'searching')      _renderLobbySearching(img, flipH, side, searchTick, hov);
    else if (lobbyPhase === 'friend_options') _renderLobbyFriendOptions(img, flipH, hov);
    else if (lobbyPhase === 'create')         _renderLobbyCreate(roomCode, searchTick, hov);
    else if (lobbyPhase === 'join')           _renderLobbyJoin(codeInput, hov);

    _onlineEscHint('ESC · BACK');
  }

  function renderOnlineCountdown(side, remoteSide, secondsRemaining, localIdentity = null, remoteIdentity = null) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();

    const img   = side === 'boy' ? images.boy : images.girl;
    const flipH = side === 'girl';

    drawOnlineLabel('SERVER COUNTDOWN SYNCED', CANVAS_W / 2, 18, {
      bg:        'rgba(16,34,62,0.88)',
      stroke:    'rgba(120,200,255,0.55)',
      textColor: 'rgba(220,240,255,0.96)',
    });
    blit(img, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - SPRITE_W / 2, 120, SPRITE_W, SPRITE_H, flipH, 1);

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 34px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.50)';
    ctx.shadowBlur  = 18;
    ctx.fillText('MATCH FOUND', CANVAS_W / 2, 78);

    ctx.shadowBlur  = 0;
    ctx.font        = '16px "Cinzel Decorative", serif';
    ctx.fillStyle   = 'rgba(190,205,255,0.78)';
    ctx.fillText(`YOU: ${formatIdentityLabel(side, localIdentity)}`, CANVAS_W / 2, 214);
    ctx.fillText(
      `PARTNER: ${remoteIdentity?.displayName ? formatIdentityLabel(remoteSide, remoteIdentity) : (remoteSide ? formatIdentityLabel(remoteSide, null) : 'CONNECTING')}`,
      CANVAS_W / 2,
      240
    );

    ctx.font        = 'bold 104px monospace';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.18)';
    ctx.shadowBlur  = 22;
    ctx.fillText(secondsRemaining > 0 ? String(secondsRemaining) : 'GO', CANVAS_W / 2, 372);

    ctx.shadowBlur  = 0;
    ctx.font        = '15px "Cinzel Decorative", serif';
    ctx.fillStyle   = 'rgba(190,205,255,0.70)';
    ctx.fillText('Get ready to run', CANVAS_W / 2, 420);
    ctx.restore();

    _onlineEscHint('ESC · CANCEL MATCH');
  }

  function _renderLobbyMain(img, flipH, side, hov) {
    void side;
    blit(img, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - SPRITE_W / 2, 186, SPRITE_W, SPRITE_H, flipH, 1);

    // btnW=320, btnX=(960-320)/2=320
    drawRedButton(320, 272, 320, 56, 'FIND MATCH',       hov.findMatch,  20);
    drawRedButton(320, 348, 320, 56, 'PLAY WITH FRIEND', hov.playFriend, 20);
  }

  function _renderLobbySearching(img, flipH, side, searchTick, hov) {
    void side;
    blit(img, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - SPRITE_W / 2, 186, SPRITE_W, SPRITE_H, flipH, 1);
    const dots = '.'.repeat(Math.floor(searchTick / 20) % 4);
    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 22px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.40)';
    ctx.shadowBlur  = 10;
    ctx.fillText('SEARCHING FOR A PARTNER' + dots, CANVAS_W / 2, 284);
    ctx.restore();
    // btnW=200, btnX=(960-200)/2=380
    drawRedButton(380, 350, 200, 44, 'CANCEL', hov.cancel, 16);
  }

  function _renderLobbyFriendOptions(img, flipH, hov) {
    blit(img, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - SPRITE_W / 2, 186, SPRITE_W, SPRITE_H, flipH, 1);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '15px "Cinzel Decorative", serif';
    ctx.fillStyle = 'rgba(190,205,255,0.75)';
    ctx.fillText('How would you like to connect?', CANVAS_W / 2, 250);
    ctx.restore();
    // btnW=280, btnX=(960-280)/2=340
    drawRedButton(340, 282, 280, 52, 'CREATE ROOM', hov.create, 18);
    drawRedButton(340, 354, 280, 52, 'ENTER CODE',  hov.join,   18);
  }

  function _renderLobbyCreate(roomCode, searchTick, hov) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '16px "Cinzel Decorative", serif';
    ctx.fillStyle = 'rgba(190,205,255,0.75)';
    ctx.fillText('Share this code with your friend:', CANVAS_W / 2, 198);

    ctx.font        = 'bold 64px monospace';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.60)';
    ctx.shadowBlur  = 20;
    ctx.fillText(roomCode || '------', CANVAS_W / 2, 290);
    ctx.shadowBlur  = 0;

    const dots = '.'.repeat(Math.floor(searchTick / 20) % 4);
    ctx.font      = '17px "Cinzel Decorative", serif';
    ctx.fillStyle = 'rgba(190,205,255,0.65)';
    ctx.fillText('Waiting for your partner' + dots, CANVAS_W / 2, 338);
    ctx.restore();
    // btnW=200, btnX=(960-200)/2=380
    drawRedButton(380, 390, 200, 44, 'CANCEL', hov.cancel, 16);
  }

  function _renderLobbyJoin(codeInput, hov) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '16px "Cinzel Decorative", serif';
    ctx.fillStyle = 'rgba(190,205,255,0.75)';
    ctx.fillText("ENTER YOUR FRIEND'S ROOM CODE:", CANVAS_W / 2, 210);

    // Input box: x=320, y=170, w=320, h=52
    ctx.fillStyle = 'rgba(10,12,28,0.90)';
    ctx.fillRect(320, 232, 320, 52);
    const _codeCursorOn = Math.floor(Date.now() / 530) % 2 === 0;
    ctx.strokeStyle = _codeCursorOn ? 'rgba(180,210,255,0.95)' : 'rgba(130,150,220,0.70)';
    ctx.lineWidth   = _codeCursorOn ? 2.5 : 2;
    ctx.strokeRect(320, 232, 320, 52);
    ctx.font      = 'bold 28px monospace';
    ctx.fillStyle = '#ffffff';
    const _codeWithCursor = codeInput + (_codeCursorOn ? '|' : ' ');
    ctx.fillText(_codeWithCursor, CANVAS_W / 2, 232 + 52 / 2 + 10);
    ctx.restore();

    // JOIN: btnW=200 btnX=380 y=244; CANCEL: btnW=160 btnX=400 y=320
    drawRedButton(380, 314, 200, 52, 'JOIN',   hov.joinSubmit, 18);
    drawRedButton(400, 390, 160, 40, 'CANCEL', hov.cancel,     15);
  }

  function renderSoloSideSelect(boyHovered, girlHovered) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    drawOnlineLabel('SINGLE PLAYER', CANVAS_W / 2, 26, {
      bg:        'rgba(28,18,56,0.86)',
      stroke:    'rgba(165,120,255,0.50)',
      textColor: 'rgba(232,220,255,0.95)',
    });

    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 40px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.55)';
    ctx.shadowBlur  = 22;
    ctx.fillText('CHOOSE YOUR SIDE', CANVAS_W / 2, 94);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font      = '13px monospace';
    ctx.fillStyle = 'rgba(255,210,120,0.88)';
    ctx.fillText('YOUR LOVER WAITS AT THE REUNION ZONE', CANVAS_W / 2, 392);
    ctx.restore();
    _drawSideCard(240, 130, 220, 240, images.boy,  false, 'BOY',  'LEFT SIDE',  'W  A  S  D', boyHovered,  menuWalkFrame());
    _drawSideCard(500, 130, 220, 240, images.girl, true,  'GIRL', 'RIGHT SIDE', '←  ↑  ↓  →', girlHovered, menuWalkFrame());

    _onlineEscHint('ESC · BACK TO MENU');
  }

  function renderSoloCountdown(side, secondsRemaining) {
    const img    = side === 'boy' ? images.boy : images.girl;
    const flipH  = side === 'girl';
    const label  = side === 'boy' ? 'BOY' : 'GIRL';

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    drawOnlineLabel('SINGLE PLAYER', CANVAS_W / 2, 26, {
      bg:        'rgba(28,18,56,0.86)',
      stroke:    'rgba(165,120,255,0.50)',
      textColor: 'rgba(232,220,255,0.95)',
    });

    ctx.save();
    ctx.textAlign = 'center';

    blit(img, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - SPRITE_W / 2, 160, SPRITE_W, SPRITE_H, flipH, 1);

    ctx.font        = 'bold 22px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.40)';
    ctx.shadowBlur  = 10;
    ctx.fillText(`PLAYING AS ${label}`, CANVAS_W / 2, 240);

    ctx.font        = 'bold 104px monospace';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.18)';
    ctx.shadowBlur  = 22;
    ctx.fillText(secondsRemaining > 0 ? String(secondsRemaining) : 'GO', CANVAS_W / 2, 372);

    ctx.shadowBlur  = 0;
    ctx.font        = '15px "Cinzel Decorative", serif';
    ctx.fillStyle   = 'rgba(190,205,255,0.70)';
    ctx.fillText('Get ready to run', CANVAS_W / 2, 420);
    ctx.restore();
  }

  function renderLocalCountdown(secondsRemaining) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSpaceBackground();
    drawOnlineLabel('LOCAL MULTIPLAYER', CANVAS_W / 2, 26, {
      bg:        'rgba(56,22,28,0.86)',
      stroke:    'rgba(255,140,155,0.50)',
      textColor: 'rgba(255,232,236,0.95)',
    });

    ctx.save();
    ctx.textAlign = 'center';

    blit(images.boy, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 - 88, 160, SPRITE_W, SPRITE_H, false, 1);
    blit(images.girl, menuWalkFrame(), FRAME_W, FRAME_H, CANVAS_W / 2 + 40, 160, SPRITE_W, SPRITE_H, true, 1);

    ctx.font        = 'bold 22px "Cinzel Decorative", serif';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.40)';
    ctx.shadowBlur  = 10;
    ctx.fillText('BOTH LOVERS READY', CANVAS_W / 2, 240);

    ctx.font        = 'bold 104px monospace';
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.18)';
    ctx.shadowBlur  = 22;
    ctx.fillText(secondsRemaining > 0 ? String(secondsRemaining) : 'GO', CANVAS_W / 2, 372);

    ctx.shadowBlur  = 0;
    ctx.font        = '15px "Cinzel Decorative", serif';
    ctx.fillStyle   = 'rgba(190,205,255,0.70)';
    ctx.fillText('Get ready to run', CANVAS_W / 2, 420);
    ctx.restore();
  }

  return {
    renderOnlineSideSelect,
    renderOnlineNameEntry,
    renderOnlineLobby,
    renderOnlineCountdown,
    renderSoloSideSelect,
    renderSoloCountdown,
    renderLocalCountdown,
  };
}
