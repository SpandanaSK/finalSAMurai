async function get_all_projects() {
  const response = await fetch(`/project-manager/filter_projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  var projects = response.json()
  return projects
}


async function create_new_project(name, desc, created_by, created_on) {
  var response = await fetch(`/project-manager/create_new_project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'project_name': name,
      'project_desc': desc,
      'created_on': created_on,
      'created_by': created_by
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  response = await response.json()
  show_message(response["message"])
  return response
}


async function load_project(project_id) {
  var response = await fetch(`/project-manager/load_project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'project_id': project_id
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  response = await response.json()
  show_message(response["message"])
  return response
}

// // project_id = data.get('project_id')
// json_data = data.get('json_data')
// last_edit_by = data.get('last_edit_by')
// commit_message = data.get('commit_message', 'Dataset update')
// project_manager.save_project(project_id, json_data, last_edit_by, commit_message)
async function save_project(project_id, name, desc, created_by, created_on) {
  var _via_project = {
    '_via_settings': _via_settings,
    '_via_img_metadata': _via_img_metadata,
    '_via_attributes': _via_attributes,
    '_via_data_format_version': '2.0.10',
    '_via_image_id_list': _via_image_id_list
  };
  _via_project._via_settings.project.name = name
  _via_project._via_settings.project.description = desc
  _via_project._via_settings.project.created_on = created_on
  _via_project._via_settings.project.created_by = created_by
  _via_project._via_settings.project.temp_project = false
  
  var response = await fetch(`/project-manager/save_project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'project_id': project_id,
      'json_data': _via_project,
      'last_edit_by': created_by,
      'commit_message': 'Saved at '+new Date().toUTCString()
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  response = await response.json()
  show_message(response["message"])
  return response
}


document.addEventListener('keydown', async function (event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault(); // prevent the browser's default Save page dialog

    console.log('Ctrl+S detected');
    if (_via_settings.project.temp_project) {
      show_save_temp_project_modal()
    } else {
      response = await save_project(_selected_project_id, _via_settings.project.name,  _via_settings.project.desc,  _via_settings.project.created_by,  _via_settings.project.created_on);
      show_message(response['message']);
    }
  }
});