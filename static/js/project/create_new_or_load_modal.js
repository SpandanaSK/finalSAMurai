let _project_table_data = [];  // All project metadata rows
let _selected_project_id = null;


function populate_create_new_or_load_data_form(project) {
  document.getElementById('create_new_or_load_project_name').value = project['Project Name'] || '';
  document.getElementById('create_new_or_load_project_description').value = project['Project Description'] || '';
  document.getElementById('create_new_or_load_project_created_by').value = project['Created by'] || '';
  document.getElementById('create_new_or_load_project_created_on').value = project['Created on'] || '';
  document.getElementById('create_new_or_load_project_edited_by').value = project['Last Edit by'] || '';
}

function clear_create_new_or_load_data_form() {
  document.getElementById('create_new_or_load_project_name').value = '';
  document.getElementById('create_new_or_load_project_description').value = '';
  document.getElementById('create_new_or_load_project_created_by').value = '';
  document.getElementById('create_new_or_load_project_created_on').value = '';
  document.getElementById('create_new_or_load_project_edited_by').value = '';
  const btn = document.getElementById('create_new_or_load_modal_ok_btn')
  const btn_small_label = document.getElementById('project_mode_label')
  btn.disabled = true
  btn_small_label.textContent = ""
}

function populate_project_table(projects, modal_table_id) {
  const tbody = document.getElementById(modal_table_id);
  tbody.innerHTML = '';
  const btn_small_label = document.getElementById('project_mode_label')
  const btn = document.getElementById('create_new_or_load_modal_ok_btn')
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const row = document.createElement('tr');
    row.onclick = () => {
      _selected_project_id = proj['Project ID'];
      console.log('Selected project_id:', _selected_project_id);
      highlight_selected_row(row);
      populate_create_new_or_load_data_form(proj);
      btn.innerHTML = "Load Existing Project"
      btn.disabled = false
      create_temporary_project_btn.disabled = true
      btn.dataset.mode = "load_project"
      btn_small_label.textContent = "Mode: Load Existing Project"
    };
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


function highlight_selected_row(row) {
  const rows = document.querySelectorAll('#project_table_body tr');
  rows.forEach(r => r.classList.remove('selected_row'));
  row.classList.add('selected_row');
}

function filter_project_table() {
  const name = document.getElementById('create_new_or_load_project_name').value;
  const desc = document.getElementById('create_new_or_load_project_description').value;
  const created = document.getElementById('create_new_or_load_project_created_by').value;
  var btn = document.getElementById('create_new_or_load_modal_ok_btn')
  const btn_small_label = document.getElementById('project_mode_label')
  const create_temporary_project_btn = document.getElementById('create_temporary_project_btn')
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

  create_temporary_project_btn.disabled = false
  btn.innerHTML = "Create New Project"
  if (name.trim().length == 0) {
    btn.disabled = true
    filtered = _project_table_data
  }
  if (filtered.length == 0) {
    btn_small_label.textContent = "Mode: Create New Project"
    btn.dataset.mode = "create_project"
    btn.disabled = false
  }
  else {
    btn_small_label.textContent = ""
  }

  
  populate_project_table(filtered, 'project_table_body');
  if (exact_matches.length == 1) {
    btn_small_label.textContent = "Mode: Load Existing Project"
    btn.innerHTML = "Load Existing Project"
    btn.dataset.mode = "load_project"
    btn.disabled = false
    create_temporary_project_btn.disabled = true
    populate_project_table(exact_matches, 'project_table_body')
  }
}


function show_create_or_load_project_modal(projects) {
  const name = document.getElementById('create_new_or_load_project_name');
  const desc = document.getElementById('create_new_or_load_project_description');
  const created_by = document.getElementById('create_new_or_load_project_created_by');
  const created_on = document.getElementById('create_new_or_load_project_created_on');
  const modal = new bootstrap.Modal(document.getElementById('create_new_or_load_project_modal'));
  _project_table_data = projects;
  _selected_project_id = null;
  clear_create_new_or_load_data_form()
  filter_project_table();
  created_on.value = new Date().toUTCString()
  const ok_btn = document.getElementById('create_new_or_load_modal_ok_btn')
  const temp_btn = document.getElementById('create_temporary_project_btn')
  _via_settings.project.temp_project = true
  temp_btn.onclick = () => {
    create_temporary_project()
    modal.hide();
    show_message("Created a temporary project. Autosave will be turned off.")
  }
  ok_btn.onclick = async () => {
    if (ok_btn.dataset.mode === 'load_project') {
      const response = await load_project(_selected_project_id);
      project_open_parse_json_file(response['results']['json_data']);
      _via_settings.project.name = name.value
      _via_settings.project.description = desc.value
      _via_settings.project.created_on = created_on.value
      _via_settings.project.created_by = created_by.value
      _via_settings.project.temp_project = false
      show_message(response['message']);
      modal.hide()
    } else if (ok_btn.dataset.mode === 'create_project') {
      const response = await create_new_project(name.value, desc.value, created_by.value, created_on.value);
      const json_data = response['results']['json_data'];
      _selected_project_id = response['results']['project_id'];
      project_open_parse_json_file(json_data);
      _via_settings.project.name = name.value
      _via_settings.project.description = desc.value
      _via_settings.project.created_on = created_on.value
      _via_settings.project.created_by = created_by.value
      _via_settings.project.temp_project = false
      modal.hide()
    }
    project_set_name(_via_settings.project.name)
  };
  modal.show();
  //document.getElementById('load_project_modal').style.display = 'block';
}


function create_temporary_project() {
  const name = document.getElementById('create_new_or_load_project_name');
  const desc = document.getElementById('create_new_or_load_project_description');
  const created_by = document.getElementById('create_new_or_load_project_created_by');
  const created_on = document.getElementById('create_new_or_load_project_created_on');
  created_on.value = new Date().toUTCString()
  _via_settings.project.name = name.value
  _via_settings.project.description = desc.value
  _via_settings.project.created_on = created_on.value
  _via_settings.project.created_by = created_by.value
  _via_settings.project.temp_project = true
  const modal = new bootstrap.Modal(document.getElementById('create_new_or_load_project_modal'));
  project_set_name(_via_settings.project.name)
  modal.hide()
}


function create_temporary_default_project() {
  _via_settings.project.name = "Untitled"
  _via_settings.project.description = ""
  _via_settings.project.created_on = new Date().toUTCString()
  _via_settings.project.created_by = "SAMurai"
  _via_settings.project.temp_project = true
  const modal = new bootstrap.Modal(document.getElementById('create_new_or_load_project_modal'));
  project_set_name(_via_settings.project.name)
  modal.hide()
  show_message("Created a temporary project. Autosave will be turned off.")
}