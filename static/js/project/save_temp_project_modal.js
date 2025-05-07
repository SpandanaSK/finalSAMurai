
function populate_save_temp_data_form() {
  document.getElementById('save_temp_project_name').value = _via_settings.project.name || '';
  document.getElementById('save_temp_project_description').value = _via_settings.project.description || '';
  document.getElementById('save_temp_project_created_by').value = _via_settings.project.created_by || '';
  document.getElementById('save_temp_project_created_on').value = _via_settings.project.created_on || '';
}

function export_project_as_json() {
  const name = document.getElementById('save_temp_project_name').value;
  const desc = document.getElementById('save_temp_project_description').value;
  const created_by = document.getElementById('save_temp_project_created_by').value;
  const created_on = document.getElementById('save_temp_project_created_on').value;

  const _via_project = {
    '_via_settings': _via_settings,
    '_via_img_metadata': _via_img_metadata,
    '_via_attributes': _via_attributes,
    '_via_data_format_version': '2.0.10',
    '_via_image_id_list': _via_image_id_list
  };
  _via_project._via_settings.project.name = name;
  _via_project._via_settings.project.description = desc;
  _via_project._via_settings.project.created_on = created_on;
  _via_project._via_settings.project.created_by = created_by;
  _via_project._via_settings.project.temp_project = true

  const jsonBlob = new Blob([JSON.stringify(_via_project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(jsonBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
}

function filter_save_temp_project_table() {
  const name = document.getElementById('save_temp_project_name').value.toLowerCase();
  const desc = document.getElementById('save_temp_project_description').value.toLowerCase();
  const created = document.getElementById('save_temp_project_created_by').value.toLowerCase();
  const save_temp_btn = document.getElementById('save_temp_modal_ok_btn');

  var filtered = _project_table_data.filter(p =>
    p['Project Name'].toLowerCase().trim().includes(name.toLowerCase().trim()) &&
    p['Project Description'].toLowerCase().trim().includes(desc.toLowerCase().trim()) &&
    p['Created by'].toLowerCase().trim().includes(created.toLowerCase().trim()) 
  );
  var exact_matches = _project_table_data.filter(p =>
    p['Project Name'].toLowerCase().trim() == name.trim() &&
    p['Project Description'].toLowerCase().trim() == desc.trim() &&
    p['Created by'].toLowerCase().trim() == created.trim()
  );

  save_temp_btn.disabled = (name.trim() === '')
  populate_save_temp_project_table(filtered, 'save_temp_project_table_body');
  if (exact_matches.length == 1) {
    populate_save_temp_project_table(exact_matches, 'save_temp_project_table_body');
    show_message("Project Name, Project Description and Project Created By is exactly same as a previous project. Cannot proceed")
    save_temp_btn.disabled = true
  }
}



function populate_save_temp_project_table(projects, modal_table_id) {
  const tbody = document.getElementById(modal_table_id);
  tbody.innerHTML = '';
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${proj['Project Name']}</td>
      <td>${proj['Project Description']}</td>
      <td>${proj['Created by']}</td>
      <td>${proj['Created on']}</td>
      <td>${proj['# Images']}</td>
    `;
    tbody.appendChild(row);
  }
}


async function save_temporary_project() {
  const name = document.getElementById('save_temp_project_name').value.trim();
  const desc = document.getElementById('save_temp_project_description').value.trim();
  const created_by = document.getElementById('save_temp_project_created_by').value.trim();
  const created_on = document.getElementById('save_temp_project_created_on').value.trim();
  
  if (name === '' || desc === '' || created_by === '') {
    show_message("Either Project Name, Description or Created By is empty.");
    return;
  }

  try {
    let response = await create_new_project(name, desc, created_by, created_on);
    _selected_project_id = response['results']['project_id'];
    response = await save_project(_selected_project_id, name, desc, created_by, created_on);
    show_message(response['message']);
    filter_save_temp_project_table()
  } catch (error) {
    console.error(error);
    show_message("Error saving project.");
  }
}

async function show_save_temp_project_modal() {
  const name = document.getElementById('save_temp_project_name');
  const desc = document.getElementById('save_temp_project_description');
  const created_by = document.getElementById('save_temp_project_created_by');
  const created_on = document.getElementById('save_temp_project_created_on');
  const modal = new bootstrap.Modal(document.getElementById('save_temp_project_modal'));
  created_on.value = new Date().toUTCString()
  populate_save_temp_data_form()
  filter_save_temp_project_table()
  // populate_save_temp_project_table(my_project_table_data, "save_temp_project_table_body")
  modal.show();
  //document.getElementById('load_project_modal').style.display = 'block';
}


