(function() {
  var GUIDE_ELEMENTS = ['fire', 'water', 'ice', 'gaia', 'earth', 'wind', 'light', 'dark'];

  var GUIDE_ELEMENT_LABELS = {
    fire: 'Fire', water: 'Water', ice: 'Ice', gaia: 'Gaia',
    earth: 'Earth', wind: 'Wind', light: 'Light', dark: 'Dark',
  };

  // Opposing pairs: each element is weak to its opposite and absorbs its own element.
  var OPPOSITES = {
    fire: 'ice',   ice:   'fire',
    water: 'gaia', gaia:  'water',
    wind:  'earth', earth: 'wind',
    light: 'dark', dark:  'light',
  };

  var GUIDE_STATUS_DEFS = [
    { name: 'Burn',    tag: 'burn',    duration: '3 rounds',  desc: 'Deals 6% max HP each round and lowers Defense by 1 stage.' },
    { name: 'Poison',  tag: 'poison',  duration: 'Permanent', desc: 'Deals 6% max HP each round until cleansed.' },
    { name: 'Stun',    tag: 'stun',    duration: '1 round',   desc: 'The creature is unable to act for its turn.' },
    { name: 'Blind',   tag: 'blind',   duration: 'Timed',     desc: 'All attacks from this creature miss.' },
    { name: 'Slow',    tag: 'slow',    duration: 'Timed',     desc: 'Speed is halved, lowering turn order.' },
    { name: 'Silence', tag: 'silence', duration: 'Timed',     desc: 'Cannot use Arts. Basic Attack and Defend still work.' },
  ];

  function getMatchup(defenderElement, attackerElement) {
    if (defenderElement === attackerElement)          return 'absorb';
    if (OPPOSITES[defenderElement] === attackerElement) return 'weak';
    return 'neutral';
  }

  function cellClass(matchup) {
    if (matchup === 'absorb')  return 'eg-absorb';
    if (matchup === 'weak')    return 'eg-weak-2';
    return 'eg-neutral';
  }

  function cellLabel(matchup) {
    if (matchup === 'absorb') return 'Absorb';
    if (matchup === 'weak')   return '1.5&times;';
    return '&mdash;';
  }

  window.isElementGuideOpen = function() {
    return !!document.getElementById('element-guide-popup');
  };

  window.hideElementGuide = function() {
    var el = document.getElementById('element-guide-popup');
    if (el) el.remove();
  };

  window.showElementGuide = function(screenId) {
    window.hideElementGuide();

    var elementHeaders = GUIDE_ELEMENTS.map(function(el) {
      return '<th><span class="eg-elem-header element-' + el + '">' + GUIDE_ELEMENT_LABELS[el] + '</span></th>';
    }).join('');

    var chartRows = GUIDE_ELEMENTS.map(function(defEl) {
      var cells = GUIDE_ELEMENTS.map(function(atkEl) {
        var matchup = getMatchup(defEl, atkEl);
        return '<td class="eg-cell ' + cellClass(matchup) + '">' + cellLabel(matchup) + '</td>';
      }).join('');
      return '<tr>' +
        '<th class="eg-row-header"><span class="eg-elem-header element-' + defEl + '">' + GUIDE_ELEMENT_LABELS[defEl] + '</span></th>' +
        cells +
        '</tr>';
    }).join('');

    var statusRows = GUIDE_STATUS_DEFS.map(function(s) {
      return '<div class="eg-status-row">' +
        '<div class="eg-status-name">' +
          '<span class="eg-status-tag eg-tag-' + s.tag + '">' + s.name + '</span>' +
          '<span class="eg-status-duration">' + s.duration + '</span>' +
        '</div>' +
        '<div class="eg-status-desc">' + s.desc + '</div>' +
        '</div>';
    }).join('');

    var popup = document.createElement('div');
    popup.id = 'element-guide-popup';
    popup.className = 'element-guide-popup';
    popup.innerHTML =
      '<div class="guide-popup-card">' +
        '<div class="guide-popup-header">' +
          '<div class="guide-popup-title">Battle Reference</div>' +
        '</div>' +
        '<div class="guide-popup-body">' +
          '<div class="stats-section-label">Element Chart &mdash; Attacker &rarr; / Defender &darr;</div>' +
          '<div class="eg-chart-legend">' +
            '<span class="eg-legend-dot eg-weak-2">1.5&times; Weakness</span>' +
            '<span class="eg-legend-dot eg-absorb">Absorb (heals)</span>' +
            '<span class="eg-legend-dot eg-neutral">Neutral</span>' +
          '</div>' +
          '<table class="eg-chart">' +
            '<thead><tr><th class="eg-chart-corner"></th>' + elementHeaders + '</tr></thead>' +
            '<tbody>' + chartRows + '</tbody>' +
          '</table>' +
          '<div class="stats-section-label" style="margin-top:18px">Status Effects</div>' +
          '<div class="eg-status-list">' + statusRows + '</div>' +
        '</div>' +
        '<div class="guide-popup-footer">I &middot; ESC &mdash; Close</div>' +
      '</div>';

    popup.addEventListener('click', function(e) {
      if (e.target === popup) { playClick(); window.hideElementGuide(); }
    });

    var screen = document.getElementById(screenId);
    if (screen) screen.appendChild(popup);
  };
}());
