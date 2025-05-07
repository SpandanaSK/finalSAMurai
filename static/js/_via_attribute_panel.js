function attribute_update_panel_set_active_button() {
  var attribute_type;
  for ( attribute_type in _via_attributes ) {
    var bid = 'button_show_' + attribute_type + '_attributes';
    document.getElementById(bid).classList.remove('active');
  }
  var bid = 'button_show_' + _via_attribute_being_updated + '_attributes';
  document.getElementById(bid).classList.add('active');
}

function show_region_attributes_update_panel() {
  _via_attribute_being_updated = 'region';
  var rattr_list = Object.keys(_via_attributes['region']);
  if ( rattr_list.length ) {
    _via_current_attribute_id = rattr_list[0];
  } else {
    _via_current_attribute_id = '';
  }
  update_attributes_update_panel();
  attribute_update_panel_set_active_button();

}

function show_file_attributes_update_panel() {
  _via_attribute_being_updated = 'file';
  var fattr_list = Object.keys(_via_attributes['file']);
  if ( fattr_list.length ) {
    _via_current_attribute_id = fattr_list[0];
  } else {
    _via_current_attribute_id = '';
  }
  update_attributes_update_panel();
  attribute_update_panel_set_active_button();
}

function update_attributes_name_list() {
  var p = document.getElementById('attributes_name_list');
  p.innerHTML = '';

  var attr;
  for ( attr in _via_attributes[_via_attribute_being_updated] ) {
    var option = document.createElement('option');
    option.setAttribute('value', attr)
    option.innerHTML = attr;
    if ( attr === _via_current_attribute_id ) {
      option.setAttribute('selected', 'selected');
    }
    p.appendChild(option);
  }
}

function update_attributes_update_panel() {
  if ( document.getElementById('attributes_editor_panel').classList.contains('show') ) {
    update_attributes_name_list();
    show_attribute_properties();
    show_attribute_options();
  }
}

function update_attribute_properties_panel() {
  if ( document.getElementById('attributes_editor_panel').classList.contains('show') ) {
    show_attribute_properties();
    show_attribute_options();
  }
}

function show_attribute_properties() {
  var attr_list = document.getElementById('attributes_name_list');
  document.getElementById('attribute_properties').innerHTML = '';

  if ( attr_list.options.length === 0 ) {
    return;
  }

  if ( typeof(_via_current_attribute_id) === 'undefined' || _via_current_attribute_id === '' ) {
    _via_current_attribute_id = attr_list.options[0].value;
  }

  var attr_id = _via_current_attribute_id;
  var attr_type = _via_attribute_being_updated;
  var attr_input_type = _via_attributes[attr_type][attr_id].type;
  var attr_desc = _via_attributes[attr_type][attr_id].description;

  attribute_property_add_input_property('Name of attribute (appears in exported annotations)',
                                        'Name',
                                        attr_id,
                                        'attribute_name');
  attribute_property_add_input_property('Description of attribute (shown to user during annotation session)',
                                        'Desc.',
                                        attr_desc,
                                        'attribute_description');

  if ( attr_input_type === 'text' ) {
    var attr_default_value = _via_attributes[attr_type][attr_id].default_value;
    attribute_property_add_input_property('Default value of this attribute',
                                          'Def.',
                                          attr_default_value,
                                          'attribute_default_value');
  }

  // add dropdown for type of attribute
  var p = document.createElement('div');
  p.setAttribute('class', 'property');
  var c0 = document.createElement('span');
  c0.setAttribute('title', 'Attribute type (e.g. text, checkbox, radio, etc)');
  c0.innerHTML = 'Type';
  var c1 = document.createElement('span');
  var c1b = document.createElement('select');
  c1b.setAttribute('onchange', 'attribute_property_on_update(this)');
  c1b.setAttribute('id', 'attribute_type');
  var type_id;
  for ( type_id in VIA_ATTRIBUTE_TYPE ) {
    var type = VIA_ATTRIBUTE_TYPE[type_id];
    var option = document.createElement('option');
    option.setAttribute('value', type);
    option.innerHTML = type;
    if ( attr_input_type == type ) {
      option.setAttribute('selected', 'selected');
    }
    c1b.appendChild(option);
  }
  c1.appendChild(c1b);
  p.appendChild(c0);
  p.appendChild(c1);
  document.getElementById('attribute_properties').appendChild(p);
}

function show_attribute_options() {
  var attr_list = document.getElementById('attributes_name_list');
  document.getElementById('attribute_options').innerHTML = '';
  if ( attr_list.options.length === 0 ) {
    return;
  }

  var attr_id = attr_list.value;
  var attr_type = _via_attributes[_via_attribute_being_updated][attr_id].type;

  // populate additional options based on attribute type
  switch( attr_type ) {
  case VIA_ATTRIBUTE_TYPE.TEXT:
    // text does not have any additional properties
    break;
  case VIA_ATTRIBUTE_TYPE.IMAGE:
    var p = document.createElement('div');
    p.setAttribute('class', 'property');
    p.setAttribute('style', 'text-align:center');
    var c0 = document.createElement('span');
    c0.setAttribute('style', 'width:25%');
    c0.setAttribute('title', 'When selected, this is the value that appears in exported annotations');
    c0.innerHTML = 'id';
    var c1 = document.createElement('span');
    c1.setAttribute('style', 'width:60%');
    c1.setAttribute('title', 'URL or base64 (see https://www.base64-image.de/) encoded image data that corresponds to the image shown as an option to the annotator');
    c1.innerHTML = 'image url or b64';
    var c2 = document.createElement('span');
    c2.setAttribute('title', 'The default value of this attribute');
    c2.innerHTML = 'def.';
    p.appendChild(c0);
    p.appendChild(c1);
    p.appendChild(c2);
    document.getElementById('attribute_options').appendChild(p);

    var options = _via_attributes[_via_attribute_being_updated][attr_id].options;
    var option_id;
    for ( option_id in options ) {
      var option_desc = options[option_id];

      var option_default = _via_attributes[_via_attribute_being_updated][attr_id].default_options[option_id];
      attribute_property_add_option(attr_id, option_id, option_desc, option_default, attr_type);
    }
    attribute_property_add_new_entry_option(attr_id, attr_type);
    break;
  case VIA_ATTRIBUTE_TYPE.CHECKBOX: // handled by next case
  case VIA_ATTRIBUTE_TYPE.DROPDOWN: // handled by next case
  case VIA_ATTRIBUTE_TYPE.RADIO:
    var p = document.createElement('div');
    p.setAttribute('class', 'property');
    p.setAttribute('style', 'text-align:center');
    var c0 = document.createElement('span');
    c0.setAttribute('style', 'width:25%');
    c0.setAttribute('title', 'When selected, this is the value that appears in exported annotations');
    c0.innerHTML = 'id';
    var c1 = document.createElement('span');
    c1.setAttribute('style', 'width:60%');
    c1.setAttribute('title', 'This is the text shown as an option to the annotator');
    c1.innerHTML = 'description';
    var c2 = document.createElement('span');
    c2.setAttribute('title', 'The default value of this attribute');
    c2.innerHTML = 'def.';
    p.appendChild(c0);
    p.appendChild(c1);
    p.appendChild(c2);
    document.getElementById('attribute_options').appendChild(p);

    var options = _via_attributes[_via_attribute_being_updated][attr_id].options;
    var option_id;
    for ( option_id in options ) {
      var option_desc = options[option_id];

      var option_default = _via_attributes[_via_attribute_being_updated][attr_id].default_options[option_id];
      attribute_property_add_option(attr_id, option_id, option_desc, option_default, attr_type);
    }
    attribute_property_add_new_entry_option(attr_id, attr_type);
    break;
  default:
    console.log('Attribute type ' + attr_type + ' is unavailable');
  }
}

function attribute_property_add_input_property(title, name, value, id) {
  var p = document.createElement('div');
  p.setAttribute('class', 'property');
  var c0 = document.createElement('span');
  c0.setAttribute('title', title);
  c0.innerHTML = name;
  var c1 = document.createElement('span');
  var c1b = document.createElement('input');
  c1b.setAttribute('onchange', 'attribute_property_on_update(this)');
  if ( typeof(value) !== 'undefined' ) {
    c1b.setAttribute('value', value);
  }
  c1b.setAttribute('id', id);
  c1.appendChild(c1b);
  p.appendChild(c0);
  p.appendChild(c1);

  document.getElementById('attribute_properties').appendChild(p);
}

function attribute_property_add_option(attr_id, option_id, option_desc, option_default, attribute_type) {
  var p = document.createElement('div');
  p.setAttribute('class', 'property');
  var c0 = document.createElement('span');
  var c0b = document.createElement('input');
  c0b.setAttribute('type', 'text');
  c0b.setAttribute('value', option_id);
  c0b.setAttribute('title', option_id);
  c0b.setAttribute('onchange', 'attribute_property_on_option_update(this)');
  c0b.setAttribute('id', '_via_attribute_option_id_' + option_id);

  var c1 = document.createElement('span');
  var c1b = document.createElement('input');
  c1b.setAttribute('type', 'text');

  if ( attribute_type === VIA_ATTRIBUTE_TYPE.IMAGE ) {
    var option_desc_info = option_desc.length + ' bytes of base64 image data';
    c1b.setAttribute('value', option_desc_info);
    c1b.setAttribute('title', 'To update, copy and paste base64 image data in this text box');
  } else {
    c1b.setAttribute('value', option_desc);
    c1b.setAttribute('title', option_desc);
  }
  c1b.setAttribute('onchange', 'attribute_property_on_option_update(this)');
  c1b.setAttribute('id', '_via_attribute_option_description_' + option_id);

  var c2 = document.createElement('span');
  var c2b = document.createElement('input');
  c2b.setAttribute('type', attribute_type);
  if ( typeof option_default !== 'undefined' ) {
    c2b.checked = option_default;
  }
  if ( attribute_type === 'radio' || attribute_type === 'image' || attribute_type === 'dropdown' ) {
    // ensured that user can activate only one radio button
    c2b.setAttribute('type', 'radio');
    c2b.setAttribute('name', attr_id);
  }

  c2b.setAttribute('onchange', 'attribute_property_on_option_update(this)');
  c2b.setAttribute('id', '_via_attribute_option_default_' + option_id);

  c0.appendChild(c0b);
  c1.appendChild(c1b);
  c2.appendChild(c2b);
  p.appendChild(c0);
  p.appendChild(c1);
  p.appendChild(c2);

  document.getElementById('attribute_options').appendChild(p);
}

function attribute_property_add_new_entry_option(attr_id, attribute_type) {
  var p = document.createElement('div');
  p.setAttribute('class', 'new_option_id_entry');
  var c0b = document.createElement('input');
  c0b.setAttribute('type', 'text');
  c0b.setAttribute('onchange', 'attribute_property_on_option_add(this)');
  c0b.setAttribute('id', '_via_attribute_new_option_id');
  c0b.setAttribute('placeholder', 'Add new option id');
  p.appendChild(c0b);
  document.getElementById('attribute_options').appendChild(p);
}

function attribute_property_on_update(p) {
  var attr_id = get_current_attribute_id();
  var attr_type = _via_attribute_being_updated;
  var new_attr_type = p.value;

  switch(p.id) {
  case 'attribute_name':
    if ( new_attr_type !== attr_id ) {
      Object.defineProperty(_via_attributes[attr_type],
                            new_attr_type,
                            Object.getOwnPropertyDescriptor(_via_attributes[attr_type], attr_id));

      delete _via_attributes[attr_type][attr_id];
      update_attributes_update_panel();
      annotation_editor_update_content();
    }
    break;
  case 'attribute_description':
    _via_attributes[attr_type][attr_id].description = new_attr_type;
    update_attributes_update_panel();
    annotation_editor_update_content();
    break;
  case 'attribute_default_value':
    _via_attributes[attr_type][attr_id].default_value = new_attr_type;
    update_attributes_update_panel();
    annotation_editor_update_content();
    break;
  case 'attribute_type':
    var old_attr_type = _via_attributes[attr_type][attr_id].type;
    _via_attributes[attr_type][attr_id].type = new_attr_type;
    if( new_attr_type === VIA_ATTRIBUTE_TYPE.TEXT ) {
      _via_attributes[attr_type][attr_id].default_value = '';
      //delete _via_attributes[attr_type][attr_id].options;
      //delete _via_attributes[attr_type][attr_id].default_options;
    } else {
      // add options entry (if missing)
      if ( ! _via_attributes[attr_type][attr_id].hasOwnProperty('options') ) {
        _via_attributes[attr_type][attr_id].options = {};
        _via_attributes[attr_type][attr_id].default_options = {};
      }
      if ( _via_attributes[attr_type][attr_id].hasOwnProperty('default_value') ) {
        //delete _via_attributes[attr_type][attr_id].default_value;
      }

      // 1. gather all the attribute values in existing metadata
      var existing_attr_values = attribute_get_unique_values(attr_type, attr_id);

      // 2. for checkbox, radio, dropdown: create options based on existing options and existing values
      for(var option_id in _via_attributes[attr_type][attr_id]['options']) {
        if( !existing_attr_values.includes(option_id) ) {
          _via_attributes[attr_type][attr_id]['options'][option_id] = option_id;
        }
      }

      // update existing metadata to reflect changes in attribute type
      // ensure that attribute has only one value
      for(var img_id in _via_img_metadata ) {
        for(var rindex in _via_img_metadata[img_id]['regions']) {
          if(_via_img_metadata[img_id]['regions'][rindex]['region_attributes'].hasOwnProperty(attr_id)) {
            if(old_attr_type === VIA_ATTRIBUTE_TYPE.CHECKBOX &&
                (new_attr_type === VIA_ATTRIBUTE_TYPE.RADIO ||
                new_attr_type === VIA_ATTRIBUTE_TYPE.DROPDOWN) ) {
              // add only if checkbox has only single option selected
              var sel_option_count = 0;
              var sel_option_id;
              for(var option_id in _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id]) {
                if(_via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id][option_id]) {
                  sel_option_count = sel_option_count + 1;
                  sel_option_id = option_id;
                }
              }
              if(sel_option_count === 1) {
                _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id] = sel_option_id;
              } else {
                // delete as multiple options cannot be represented as radio or dropdown
                delete _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id];
              }
            }
            if( (old_attr_type === VIA_ATTRIBUTE_TYPE.RADIO ||
                  old_attr_type === VIA_ATTRIBUTE_TYPE.DROPDOWN) &&
                new_attr_type === VIA_ATTRIBUTE_TYPE.CHECKBOX) {
              var old_option_id = _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id];
              _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id] = {};
              _via_img_metadata[img_id]['regions'][rindex]['region_attributes'][attr_id][old_option_id] = true;
            }
          }
        }
      }
    }
    show_attribute_properties();
    show_attribute_options();
    annotation_editor_update_content();
    break;
  }
}

function attribute_get_unique_values(attr_type, attr_id) {
  var values = [];
  switch ( attr_type ) {
  case 'file':
    var img_id, attr_val;
    for ( img_id in _via_img_metadata ) {
      if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
        attr_val = _via_img_metadata[img_id].file_attributes[attr_id];
        if ( ! values.includes(attr_val) ) {
          values.push(attr_val);
        }
      }
    }
    break;
  case 'region':
    var img_id, attr_val, i;
    for ( img_id in _via_img_metadata ) {
      for ( i = 0; i < _via_img_metadata[img_id].regions.length; ++i ) {
        if ( _via_img_metadata[img_id].regions[i].region_attributes.hasOwnProperty(attr_id) ) {
          attr_val = _via_img_metadata[img_id].regions[i].region_attributes[attr_id];
          if( typeof(attr_val) === 'object' ) {
            for(var option_id in _via_img_metadata[img_id].regions[i].region_attributes[attr_id]) {
              if ( ! values.includes(option_id) ) {
                values.push(option_id);
              }
            }
          } else {
            if ( ! values.includes(attr_val) ) {
              values.push(attr_val);
            }
          }
        }
      }
    }
    break;
  default:
    break;
  }
  return values;
}

function attribute_property_on_option_update(p) {
  var attr_id = get_current_attribute_id();
  if ( p.id.startsWith('_via_attribute_option_id_') ) {
    var old_key = p.id.substr( '_via_attribute_option_id_'.length );
    var new_key = p.value;
    if ( old_key !== new_key ) {
      var option_id_test = attribute_property_option_id_is_valid(attr_id, new_key);
      if ( option_id_test.is_valid ) {
        update_attribute_option_id_with_confirm(_via_attribute_being_updated,
                                                attr_id,
                                                old_key,
                                                new_key);
      } else {
        p.value = old_key; // restore old value
        show_message( option_id_test.message );
        show_attribute_properties();
      }
      return;
    }
  }

  if ( p.id.startsWith('_via_attribute_option_description_') ) {
    var key = p.id.substr( '_via_attribute_option_description_'.length );
    var old_value = _via_attributes[_via_attribute_being_updated][attr_id].options[key];
    var new_value = p.value;
    if ( new_value !== old_value ) {
      _via_attributes[_via_attribute_being_updated][attr_id].options[key] = new_value;
      show_attribute_properties();
      annotation_editor_update_content();
    }
  }

  if ( p.id.startsWith('_via_attribute_option_default_') ) {
    var new_default_option_id = p.id.substr( '_via_attribute_option_default_'.length );
    var old_default_option_id_list = Object.keys(_via_attributes[_via_attribute_being_updated][attr_id].default_options);

    if ( old_default_option_id_list.length === 0 ) {
      // default set for the first time
      _via_attributes[_via_attribute_being_updated][attr_id].default_options[new_default_option_id] = p.checked;
    } else {
      switch ( _via_attributes[_via_attribute_being_updated][attr_id].type ) {
      case 'image':    // fallback
      case 'dropdown': // fallback
      case 'radio':    // fallback
        // to ensure that only one radio button is selected at a time
        _via_attributes[_via_attribute_being_updated][attr_id].default_options = {};
        _via_attributes[_via_attribute_being_updated][attr_id].default_options[new_default_option_id] = p.checked;
        break;
      case 'checkbox':
        _via_attributes[_via_attribute_being_updated][attr_id].default_options[new_default_option_id] = p.checked;
        break;
      }
    }
    // default option updated
    attribute_property_on_option_default_update(_via_attribute_being_updated,
                                                attr_id,
                                                new_default_option_id).then( function() {
                                                  show_attribute_properties();
                                                  annotation_editor_update_content();
                                                });
  }
}

function attribute_property_on_option_default_update(attribute_being_updated, attr_id, new_default_option_id) {
  return new Promise( function(ok_callback, err_callback) {
    // set all metadata to new_value if:
    // - metadata[attr_id] is missing
    // - metadata[attr_id] is set to option_old_value
    var img_id, attr_value, n, i;
    var attr_type = _via_attributes[attribute_being_updated][attr_id].type;
    switch( attribute_being_updated ) {
    case 'file':
      for ( img_id in _via_img_metadata ) {
        if ( ! _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
          _via_img_metadata[img_id].file_attributes[attr_id] = new_default_option_id;
        }
      }
      break;
    case 'region':
      for ( img_id in _via_img_metadata ) {
        n = _via_img_metadata[img_id].regions.length;
        for ( i = 0; i < n; ++i ) {
          if ( ! _via_img_metadata[img_id].regions[i].region_attributes.hasOwnProperty(attr_id) ) {
            _via_img_metadata[img_id].regions[i].region_attributes[attr_id] = new_default_option_id;
          }
        }
      }
      break;
    }
    ok_callback();
  });
}

function attribute_property_on_option_add(p) {
  if ( p.value === '' || p.value === null ) {
    return;
  }

  if ( p.id === '_via_attribute_new_option_id' ) {
    var attr_id = get_current_attribute_id();
    var option_id = p.value;
    var option_id_test = attribute_property_option_id_is_valid(attr_id, option_id);
    if ( option_id_test.is_valid ) {
      _via_attributes[_via_attribute_being_updated][attr_id].options[option_id] = '';
      show_attribute_options();
      annotation_editor_update_content();
    } else {
      show_message( option_id_test.message );
      attribute_property_reset_new_entry_inputs();
    }
  }
}

function attribute_property_reset_new_entry_inputs() {
  var container = document.getElementById('attribute_options');
  var p = container.lastChild;
  if ( p.childNodes[0] ) {
    p.childNodes[0].value = '';
  }
  if ( p.childNodes[1] ) {
    p.childNodes[1].value = '';
  }
}

function attribute_property_show_new_entry_inputs(attr_id, attribute_type) {
  var n0 = document.createElement('div');
  n0.classList.add('property');
  var n1a = document.createElement('span');
  var n1b = document.createElement('input');
  n1b.setAttribute('onchange', 'attribute_property_on_option_add(this)');
  n1b.setAttribute('placeholder', 'Add new id');
  n1b.setAttribute('value', '');
  n1b.setAttribute('id', '_via_attribute_new_option_id');
  n1a.appendChild(n1b);

  var n2a = document.createElement('span');
  var n2b = document.createElement('input');
  n2b.setAttribute('onchange', 'attribute_property_on_option_add(this)');
  n2b.setAttribute('placeholder', 'Optional description');
  n2b.setAttribute('value', '');
  n2b.setAttribute('id', '_via_attribute_new_option_description');
  n2a.appendChild(n2b);

  var n3a = document.createElement('span');
  var n3b = document.createElement('input');
  n3b.setAttribute('type', attribute_type);
  if ( attribute_type === 'radio' ) {
    n3b.setAttribute('name', attr_id);
  }
  n3b.setAttribute('onchange', 'attribute_property_on_option_add(this)');
  n3b.setAttribute('id', '_via_attribute_new_option_default');
  n3a.appendChild(n3b);

  n0.appendChild(n1a);
  n0.appendChild(n2a);
  n0.appendChild(n3a);

  var container = document.getElementById('attribute_options');
  container.appendChild(n0);
}

function attribute_property_option_id_is_valid(attr_id, new_option_id) {
  var option_id;
  for ( option_id in _via_attributes[_via_attribute_being_updated][attr_id].options ) {
    if ( option_id === new_option_id ) {
      return { 'is_valid':false, 'message':'Option id [' + attr_id + '] already exists' };
    }
  }

  if ( new_option_id.includes('__') ) { // reserved separator for attribute-id, row-id, option-id
    return {'is_valid':false, 'message':'Option id cannot contain two consecutive underscores'};
  }

  return {'is_valid':true};
}

function attribute_property_id_exists(name) {
  var attr_name;
  for ( attr_name in _via_attributes[_via_attribute_being_updated] ) {
    if ( attr_name === name ) {
      return true;
    }
  }
  return false;
}

function delete_existing_attribute_with_confirm() {
  var attr_id = document.getElementById('user_input_attribute_id').value;
  if ( attr_id === '' ) {
    show_message('Enter the name of attribute that you wish to delete');
    return;
  }
  if ( attribute_property_id_exists(attr_id) ) {
    var config = {'title':'Delete ' + _via_attribute_being_updated + ' attribute [' + attr_id + ']',
                  'warning': 'Warning: Deleting an attribute will lead to the attribute being deleted in all the annotations. Please click OK only if you are sure.'};
    var input = { 'attr_type':{'type':'text', 'name':'Attribute Type', 'value':_via_attribute_being_updated, 'disabled':true},
                  'attr_id':{'type':'text', 'name':'Attribute Id', 'value':attr_id, 'disabled':true}
                };
    invoke_with_user_inputs(delete_existing_attribute_confirmed, input, config);
  } else {
    show_message('Attribute [' + attr_id + '] does not exist!');
    return;
  }
}

function delete_existing_attribute_confirmed(input) {
  var attr_type = input.attr_type.value;
  var attr_id   = input.attr_id.value;
  delete_existing_attribute(attr_type, attr_id);
  document.getElementById('user_input_attribute_id').value = '';
  show_message('Deleted ' + attr_type + ' attribute [' + attr_id + ']');
  user_input_default_cancel_handler();
}

function delete_existing_attribute(attribute_type, attr_id) {
  if ( _via_attributes[attribute_type].hasOwnProperty( attr_id ) ) {
    var attr_id_list = Object.keys(_via_attributes[attribute_type]);
    if ( attr_id_list.length === 1 ) {
      _via_current_attribute_id = '';
    } else {
      var current_index = attr_id_list.indexOf(attr_id);
      var next_index = current_index + 1;
      if ( next_index === attr_id_list.length ) {
        next_index = current_index - 1;
      }
      _via_current_attribute_id = attr_id_list[next_index];
    }
    delete _via_attributes[attribute_type][attr_id];
    delete_region_attribute_in_all_metadata(attr_id);
    update_attributes_update_panel();
    annotation_editor_update_content();
    updateOptionsForAutoBoxLabelAttributes()
  }
}

function add_new_attribute_from_user_input() {
  var attr_id = document.getElementById('user_input_attribute_id').value;
  if ( attr_id === '' ) {
    show_message('Enter the name of attribute that you wish to delete');
    return;
  }

  if ( attribute_property_id_exists(attr_id) ) {
    show_message('The ' + _via_attribute_being_updated + ' attribute [' + attr_id + '] already exists.');
  } else {
    _via_current_attribute_id = attr_id;
    add_new_attribute(attr_id);
    update_attributes_update_panel();
    annotation_editor_update_content();
    updateOptionsForAutoBoxLabelAttributes();
    show_message('Added ' + _via_attribute_being_updated + ' attribute [' + attr_id + '].');
  }
}

function add_new_attribute(attribute_id) {
  _via_attributes[_via_attribute_being_updated][attribute_id] = {};
  _via_attributes[_via_attribute_being_updated][attribute_id].type = 'text';
  _via_attributes[_via_attribute_being_updated][attribute_id].description = '';
  _via_attributes[_via_attribute_being_updated][attribute_id].default_value = '';
}

function update_current_attribute_id(p) {
  _via_current_attribute_id = p.options[p.selectedIndex].value;
  update_attribute_properties_panel();
}

function get_current_attribute_id() {
  return document.getElementById('attributes_name_list').value;
}

function update_attribute_option_id_with_confirm(attr_type, attr_id, option_id, new_option_id) {
  var is_delete = false;
  var config;
  if ( new_option_id === '' || typeof(new_option_id) === 'undefined' ) {
    // an empty new_option_id indicates deletion of option_id
    config = {'title':'Delete an option for ' + attr_type + ' attribute'};
    is_delete = true;
  } else {
    config = {'title':'Rename an option for ' + attr_type + ' attribute'};
  }

  var input = { 'attr_type':{'type':'text', 'name':'Attribute Type', 'value':attr_type, 'disabled':true},
                'attr_id':{'type':'text', 'name':'Attribute Id', 'value':attr_id, 'disabled':true}
              };

  if ( is_delete ) {
    input['option_id'] = {'type':'text', 'name':'Attribute Option', 'value':option_id, 'disabled':true};
  } else {
    input['option_id']     = {'type':'text', 'name':'Attribute Option (old)', 'value':option_id, 'disabled':true},
    input['new_option_id'] = {'type':'text', 'name':'Attribute Option (new)', 'value':new_option_id, 'disabled':true};
  }

  invoke_with_user_inputs(update_attribute_option_id_confirmed, input, config, update_attribute_option_id_cancel);
}

function update_attribute_option_id_cancel(input) {
  update_attribute_properties_panel();
}

function update_attribute_option_id_confirmed(input) {
  var attr_type = input.attr_type.value;
  var attr_id = input.attr_id.value;
  var option_id = input.option_id.value;
  var is_delete;
  var new_option_id;
  if ( typeof(input.new_option_id) === 'undefined' || input.new_option_id === '' ) {
    is_delete = true;
    new_option_id = '';
  } else {
    is_delete = false;
    new_option_id = input.new_option_id.value;
  }

  update_attribute_option(is_delete, attr_type, attr_id, option_id, new_option_id);

  if ( is_delete ) {
    show_message('Deleted option [' + option_id + '] for ' + attr_type + ' attribute [' + attr_id + '].');
  } else {
    show_message('Renamed option [' + option_id + '] to [' + new_option_id + '] for ' + attr_type + ' attribute [' + attr_id + '].');
  }
  update_attribute_properties_panel();
  annotation_editor_update_content();
  user_input_default_cancel_handler();
}

function update_attribute_option(is_delete, attr_type, attr_id, option_id, new_option_id) {
  switch ( attr_type ) {
  case 'region':
    update_region_attribute_option_in_all_metadata(is_delete, attr_id, option_id, new_option_id);
    if ( ! is_delete ) {
      Object.defineProperty(_via_attributes[attr_type][attr_id].options,
                            new_option_id,
                            Object.getOwnPropertyDescriptor(_via_attributes[_via_attribute_being_updated][attr_id].options, option_id));
    }
    delete _via_attributes['region'][attr_id].options[option_id];

    break;
  case 'file':
    update_file_attribute_option_in_all_metadata(attr_id, option_id);
    if ( ! is_delete ) {
      Object.defineProperty(_via_attributes[attr_type][attr_id].options,
                            new_option_id,
                            Object.getOwnPropertyDescriptor(_via_attributes[_via_attribute_being_updated][attr_id].options, option_id));
    }

    delete _via_attributes['file'][attr_id].options[option_id];
    break;
  }
}

function update_file_attribute_option_in_all_metadata(is_delete, attr_id, option_id, new_option_id) {
  var image_id;
  for ( image_id in _via_img_metadata ) {
    if ( _via_img_metadata[image_id].file_attributes.hasOwnProperty(attr_id) ) {
      if ( _via_img_metadata[image_id].file_attributes[attr_id].hasOwnProperty(option_id) ) {
        Object.defineProperty(_via_img_metadata[image_id].file_attributes[attr_id],
                              new_option_id,
                              Object.getOwnPropertyDescriptor(_via_img_metadata[image_id].file_attributes[attr_id], option_id));
        delete _via_img_metadata[image_id].file_attributes[attr_id][option_id];
      }
    }
  }
}

function update_region_attribute_option_in_all_metadata(is_delete, attr_id, option_id, new_option_id) {
  var image_id;
  for ( image_id in _via_img_metadata ) {
    for (var i = 0; i < _via_img_metadata[image_id].regions.length; ++i ) {
      if ( _via_img_metadata[image_id].regions[i].region_attributes.hasOwnProperty(attr_id) ) {
        if ( _via_img_metadata[image_id].regions[i].region_attributes[attr_id].hasOwnProperty(option_id) ) {
          Object.defineProperty(_via_img_metadata[image_id].regions[i].region_attributes[attr_id],
                                new_option_id,
                                Object.getOwnPropertyDescriptor(_via_img_metadata[image_id].regions[i].region_attributes[attr_id], option_id));
          delete _via_img_metadata[image_id].regions[i].region_attributes[attr_id][option_id];
        }
      }
    }
  }
}

function delete_region_attribute_in_all_metadata(attr_id) {
  var image_id;
  for ( image_id in _via_img_metadata ) {
    for (var i = 0; i < _via_img_metadata[image_id].regions.length; ++i ) {
      if ( _via_img_metadata[image_id].regions[i].region_attributes.hasOwnProperty(attr_id)) {
        delete _via_img_metadata[image_id].regions[i].region_attributes[attr_id];
      }
    }
  }
}

function delete_file_attribute_option_from_all_metadata(attr_id, option_id) {
  var image_id;
  for ( image_id in _via_img_metadata ) {
    if ( _via_img_metadata.hasOwnProperty(image_id) ) {
      delete_file_attribute_option_from_metadata(image_id, attr_id, option_id);
    }
  }
}

function delete_file_attribute_option_from_metadata(image_id, attr_id, option_id) {
  var i;
  if ( _via_img_metadata[image_id].file_attributes.hasOwnProperty(attr_id) ) {
    if ( _via_img_metadata[image_id].file_attributes[attr_id].hasOwnProperty(option_id) ) {
      delete _via_img_metadata[image_id].file_attributes[attr_id][option_id];
    }
  }
}

function delete_file_attribute_from_all_metadata(image_id, attr_id) {
  var image_id;
  for ( image_id in _via_img_metadata ) {
    if ( _via_img_metadata.hasOwnProperty(image_id) ) {
      if ( _via_img_metadata[image_id].file_attributes.hasOwnProperty(attr_id) ) {
        delete _via_img_metadata[image_id].file_attributes[attr_id];
      }
    }
  }
}

