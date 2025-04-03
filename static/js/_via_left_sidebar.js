//
// left sidebar toolbox maintainer
//
// source: https://www.w3schools.com/howto/howto_js_accordion.asp
function init_leftsidebar_accordion() {
  var leftsidebar = document.getElementById('leftsidebar');
  leftsidebar.style.width = _via_settings.ui.leftsidebar_width + 'rem';

  var acc = document.getElementsByClassName('leftsidebar_accordion');
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


function leftsidebar_toggle() {
  var leftsidebar = document.getElementById('leftsidebar');
  if ( leftsidebar.style.display === 'none' ) {
    leftsidebar.style.display = 'table-cell';
    document.getElementById('leftsidebar_collapse_panel').style.display = 'none';
  } else {
    leftsidebar.style.display = 'none';
    document.getElementById('leftsidebar_collapse_panel').style.display = 'table-cell';
  }
  _via_update_ui_components();
}

function leftsidebar_increase_width() {
  var leftsidebar = document.getElementById('leftsidebar');
  var new_width = _via_settings.ui.leftsidebar_width + VIA_LEFTSIDEBAR_WIDTH_CHANGE;
  leftsidebar.style.width = new_width + 'rem';
  _via_settings.ui.leftsidebar_width = new_width;
  if ( _via_current_image_loaded ) {
    _via_show_img(_via_image_index);
  }
}

function leftsidebar_decrease_width() {
  var leftsidebar = document.getElementById('leftsidebar');
  var new_width = _via_settings.ui.leftsidebar_width - VIA_LEFTSIDEBAR_WIDTH_CHANGE;
  if ( new_width >= 5 ) {
    leftsidebar.style.width = new_width + 'rem';
    _via_settings.ui.leftsidebar_width = new_width;
    if ( _via_current_image_loaded ) {
      _via_show_img(_via_image_index);
    }
  }
}

function leftsidebar_show() {
  var leftsidebar = document.getElementById('leftsidebar');
  leftsidebar.style.display = 'table-cell';
  document.getElementById('leftsidebar_collapse_panel').style.display = 'none';
}

