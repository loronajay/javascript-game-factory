(function() {
  var GUIDE_ELEMENTS = ['fire', 'water', 'ice', 'gaia', 'earth', 'wind', 'light', 'dark'];

  var GUIDE_ELEMENT_LABELS = {
    fire: 'Fire', water: 'Water', ice: 'Ice', gaia: 'Gaia',
    earth: 'Earth', wind: 'Wind', light: 'Light', dark: 'Dark',
  };

  var GUIDE_STATUS_DEFS = [
    { name: 'Burn',    tag: 'burn',    duration: '3 rounds',  desc: 'Deals 6% max HP each round and lowers Defense by 1 stage.' },
    { name: 'Poison',  tag: 'poison',  duration: 'Permanent', desc: 'Deals 6% max HP each round until cleansed.' },
    { name: 'Stun',    tag: 'stun',    duration: '1 round',   desc: 'The creature is unable to act for its turn.' },
    { name: 'Blind',   tag: 'blind',   duration: 'Timed',     desc: 'All attacks from this creature miss.' },
    { name: 'Slow',    tag: 'slow',    duration: 'Timed',     desc: 'Speed is halved, lowering turn order.' },
    { name: 'Silence', tag: 'silence', duration: 'Timed',     desc: 'Cannot use Arts. Basic Attack and Defend still work.' },
  ];

  function multClass(val) {
    if (val >= 1.5)  return 'eg-weak-2';
    if (val >= 1.25) return 'eg-weak-1';
    if (val <= 0.5)  return 'eg-res-2';
    if (val <= 0.75) return 'eg-res-1';
    return 'eg-neutral';
  }

  function multLabel(val) {
    if (val === 1) return '&mdash;';
    return val + '&times;';
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

    var chartRows = RENTAL_ROSTER.map(function(c) {
      var cells = GUIDE_ELEMENTS.map(function(el) {
        var val = (c.resistances && c.resistances[el] != null) ? c.resistances[el] : 1;
        return '<td class="eg-cell ' + multClass(val) + '">' + multLabel(val) + '</td>';
      }).join('');
      return '<tr>' +
        '<td class="eg-creature-cell">' +
          '<img class="eg-creature-sprite" src="' + c.sprite + '" alt="' + c.name + '">' +
          '<span class="eg-creature-name">' + c.name + '</span>' +
          '<span class="element-tag element-' + c.element + '">' + c.element + '</span>' +
        '</td>' +
        cells +
        '</tr>';
    }).join('');

    var elementHeaders = GUIDE_ELEMENTS.map(function(el) {
      return '<th><span class="eg-elem-header element-' + el + '">' + GUIDE_ELEMENT_LABELS[el] + '</span></th>';
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
          '<div class="stats-section-label">Element Chart &mdash; Incoming Damage</div>' +
          '<div class="eg-chart-legend">' +
            '<span class="eg-legend-dot eg-weak-2">1.5&times; Weak</span>' +
            '<span class="eg-legend-dot eg-weak-1">1.25&times; Slight</span>' +
            '<span class="eg-legend-dot eg-neutral">Neutral</span>' +
            '<span class="eg-legend-dot eg-res-1">0.75&times; Resists</span>' +
            '<span class="eg-legend-dot eg-res-2">0.5&times; Blocks</span>' +
          '</div>' +
          '<table class="eg-chart">' +
            '<thead><tr>' +
              '<th class="eg-chart-corner">Target &darr; &nbsp; Attacker &rarr;</th>' +
              elementHeaders +
            '</tr></thead>' +
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
