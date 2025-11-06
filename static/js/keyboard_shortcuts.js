var imageFocusShortcuts = [
  ['←', '↑', '→', '↓', 'a', 'c', 'v', 'd', 'Ctrl + Wheel', 'l'],
    [
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Select all regions',
      'Copy selected regions',
      'Paste selected regions',
      'Delete selected regions',
      'Zoom in/out (mouse cursor is over image)',
      'Toggle region label'
    ]
  ];

var alwaysAvailableShortcuts = [
  ['← →', '+ - =', '↑', '↓', 'Spacebar', 'Home / h', 'End / e', 'PgUp / u', 'PgDown / d', 'Esc'],
  [
    'Move to next/previous image',
    'Zoom in/out/reset',
    'Update region label',
    'Update region colour',
    'Toggle annotation editor (Ctrl to toggle image editor)',
    'Jump to first image',
    'Jump to last image',
    'Jump several images',
    'Jump several images',
    'Cancel ongoing task'
  ]
];

function populateTable(keysRowId, descRowId, arr) {
  var keysRow = document.getElementById(keysRowId);
  var descRow = document.getElementById(descRowId);
  if (!keysRow || !descRow) return;
  keysRow.innerHTML = '';
  descRow.innerHTML = '';
  var keys = arr[0], desc = arr[1];
  for (var i = 0; i < keys.length; ++i) {
    var tdk = document.createElement('td');
    var span = document.createElement('span');
    span.className = 'key';
    span.textContent = keys[i];
    tdk.appendChild(span);
    keysRow.appendChild(tdk);

    var tdd = document.createElement('td');
    tdd.textContent = desc[i] || '';
    descRow.appendChild(tdd);
  }
}

window.toggleKeyboardPopup = function() {
  var popup = document.getElementById('keyboard-popup');
  if (!popup) return;
  if (popup.style.display === 'flex') {
    closeKeyboardPopup();
  } else {
    showKeyboardPopup();
  }
};

window.showKeyboardPopup = function() {
  populateTable('image-focus-keys','image-focus-desc', imageFocusShortcuts);
  populateTable('always-keys','always-desc', alwaysAvailableShortcuts);
  var popup = document.getElementById('keyboard-popup');
  popup.style.display = 'flex';
  var closeBtn = document.getElementById('keyboard-close');
  if (closeBtn) closeBtn.focus();
};

window.closeKeyboardPopup = function() {
  var popup = document.getElementById('keyboard-popup');
  if (!popup) return;
  popup.style.display = 'none';
  var icon = document.getElementById('toolbar_keyboard_shortcuts');
  if (icon) icon.focus();
};

// click outside container closes popup
document.addEventListener('click', function(e) {
  var popup = document.getElementById('keyboard-popup');
  if (!popup || popup.style.display !== 'flex') return;
  var container = document.querySelector('#keyboard-popup .popup-container');
  if (container && !container.contains(e.target) &&
      !document.getElementById('toolbar_keyboard_shortcuts').contains(e.target)) {
    closeKeyboardPopup();
  }
});

// Esc key closes popup
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeKeyboardPopup();
});
