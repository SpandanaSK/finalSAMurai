//
// left sidebar toolbox maintainer
//
// source: https://www.w3schools.com/howto/howto_js_accordion.asp
function init_rightsidebar_accordion() {
  var rightsidebar = document.getElementById('rightsidebar');
  rightsidebar.style.width = _via_settings.ui.rightsidebar_width + 'rem';

  var acc = document.getElementsByClassName('rightsidebar_accordion');
  var i;
  for ( i = 0; i < acc.length; ++i ) {
    acc[i].addEventListener('click', function() {
      update_vertical_space();
      this.classList.toggle('active');
      this.nextElementSibling.classList.toggle('show');

      switch( this.innerHTML ) {
      case 'Attributes':
        update_attributes_update_panel();
        break;
      case 'Project':
        update_img_fn_list();
        break;
      }
    });
  }
}


function rightsidebar_toggle() {
  var rightsidebar = document.getElementById('rightsidebar');
  if ( rightsidebar.style.display === 'none' ) {
    rightsidebar.style.display = 'table-cell';
    document.getElementById('rightsidebar_collapse_panel').style.display = 'none';
  } else {
    rightsidebar.style.display = 'none';
    document.getElementById('rightsidebar_collapse_panel').style.display = 'table-cell';
  }
  _via_update_ui_components();
}

function rightsidebar_increase_width() {
  var rightsidebar = document.getElementById('rightsidebar');
  var new_width = _via_settings.ui.rightsidebar_width + VIA_RIGHTSIDEBAR_WIDTH_CHANGE;
  rightsidebar.style.width = new_width + 'rem';
  _via_settings.ui.rightsidebar_width = new_width;
  if ( _via_current_image_loaded ) {
    _via_show_img(_via_image_index);
  }
}

function rightsidebar_decrease_width() {
  var rightsidebar = document.getElementById('rightsidebar');
  var new_width = _via_settings.ui.rightsidebar_width - VIA_RIGHTSIDEBAR_WIDTH_CHANGE;
  if ( new_width >= 5 ) {
    rightsidebar.style.width = new_width + 'rem';
    _via_settings.ui.rightsidebar_width = new_width;
    if ( _via_current_image_loaded ) {
      _via_show_img(_via_image_index);
    }
  }
}

function rightsidebar_show() {
  var rightsidebar = document.getElementById('rightsidebar');
  rightsidebar.style.display = 'table-cell';
  document.getElementById('rightsidebar_collapse_panel').style.display = 'none';
}

