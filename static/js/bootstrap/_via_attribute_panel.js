function attribute_update_panel_set_active_button() {
  // Update to use Bootstrap's accordion classes
  var attribute_type;
  for (attribute_type in _via_attributes) {
    var bid = 'button_show_' + attribute_type + '_attributes';
    var button = document.getElementById(bid);
    if (button) {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    }
  }
  
  var bid = 'button_show_' + _via_attribute_being_updated + '_attributes';
  var activeButton = document.getElementById(bid);
  if (activeButton) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-expanded', 'true');
  }

  // Update accordion collapse state
  const accordionItems = document.querySelectorAll('.accordion-collapse');
  accordionItems.forEach(item => {
    if (item.id.includes(_via_attribute_being_updated)) {
      item.classList.add('show');
    } else {
      item.classList.remove('show');
    }
  });
}

function show_region_attributes_update_panel() {
  _via_attribute_being_updated = 'region';
  var rattr_list = Object.keys(_via_attributes['region']);
  if (rattr_list.length) {
    _via_current_attribute_id = rattr_list[0];
  } else {
    _via_current_attribute_id = '';
  }
  
  // Update accordion state
  const regionPanel = document.getElementById('regionAttributesPanel');
  if (regionPanel) {
    regionPanel.classList.add('show');
  }
  
  update_attributes_update_panel();
  attribute_update_panel_set_active_button();
}

function show_file_attributes_update_panel() {
  _via_attribute_being_updated = 'file';
  var fattr_list = Object.keys(_via_attributes['file']);
  if (fattr_list.length) {
    _via_current_attribute_id = fattr_list[0];
  } else {
    _via_current_attribute_id = '';
  }
  
  // Update accordion state
  const filePanel = document.getElementById('fileAttributesPanel');
  if (filePanel) {
    filePanel.classList.add('show');
  }
  
  update_attributes_update_panel();
  attribute_update_panel_set_active_button();
}

// Add this function to initialize accordion functionality
function init_attribute_panel_accordion() {
  const accordionButtons = document.querySelectorAll('.accordion-button');
  accordionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const isCollapsed = this.classList.contains('collapsed');
      const target = document.getElementById(this.getAttribute('data-bs-target').substring(1));
      
      if (target) {
        if (isCollapsed) {
          this.classList.remove('collapsed');
          this.setAttribute('aria-expanded', 'true');
          target.classList.add('show');
        } else {
          this.classList.add('collapsed');
          this.setAttribute('aria-expanded', 'false');
          target.classList.remove('show');
        }
      }
    });
  });
}

init_attribute_panel_accordion()