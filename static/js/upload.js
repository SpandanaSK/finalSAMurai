
async function callUploadAPI(event) {
  var user_selected_images = invisible_file_input.files;
  var formData = new FormData();
  var new_img_index_list = [];
  var discarded_file_count = 0;
  var current_files = _via_image_filename_list.length
  // Append each selected file to FormData
  for (let i = 0; i < user_selected_images.length; i++) {
      formData.append("files", user_selected_images[i]); // "files" matches Flask's request.files.getlist('files')
  }
  if (user_selected_images.length == 0) {
    alert("Please select some files to upload!");
    return;
  }
  
  img_loading_spinbar(current_files, true);
  try {
      let response = await fetch("/file-uploader/upload", {
          method: "POST",
          body: formData
      });
      // this.files = null;
      // invisible_file_input.value = null;

      let result = await response.json();
      console.log("Upload Response:", result);
      var current_images = result['images']
      for (let i = 0; i < current_images.length; i++) {
        var filetype = user_selected_images[i].type.substr(0, 5);
        var current_image = current_images[i]
        console.log(current_image)
        // continue;
        //if ( filetype === 'image' || filetype === 'video' ) {
          // check which filename in project matches the user selected file
        var img_index = _via_image_filename_list.indexOf(current_image.file_name);
        if( img_index === -1) {
          // a new file was added to project
          var new_img_id = project_add_uploaded_file(current_image, user_selected_images[i].name);
          _via_uploaded_file_id_list.add(new_img_id);
          _via_img_fileref[new_img_id] = user_selected_images[i];
          set_file_annotations_to_default_value(new_img_id);
          new_img_index_list.push( _via_image_id_list.indexOf(new_img_id) );
        } else {
          // an existing file was resolved using browser's file selector
          var img_id = _via_image_id_list[img_index];
          _via_img_fileref[img_id] = user_selected_images[i];
          _via_img_metadata[img_id]['size'] = -1;
        }
      } 
      // else {
      //   discarded_file_count += 1;
      // }
      //}
      
      if ( _via_img_metadata ) {
        var status_msg = 'Loaded ' + new_img_index_list.length + ' images.';
        if ( discarded_file_count ) {
          status_msg += ' ( Discarded ' + discarded_file_count + ' non-image files! )';
        }
        show_message(status_msg);

        if ( new_img_index_list.length ) {
          // show first of newly added image
          _via_show_img( new_img_index_list[0] );
        } else {
          // show original image
          _via_show_img ( _via_image_index );
        }
        update_img_fn_list();
      } else {
        show_message("Please upload some image files!");
      }

      if (response.ok) {
          //alert("Files uploaded successfully!");
          show_message("Files uploaded successfully!");
          
      } else {
          message("Upload failed: " + result.error);
      }
      //jump_to_image(current_files)
  } catch (error) {
      console.error("Error uploading files:", error);
      show_message("Upload failed!");
  }
  img_loading_spinbar(current_files, false);
  invisible_file_input.value = null;
  invisible_file_input.files = null; 
}
