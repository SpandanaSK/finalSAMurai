async function get_fps(file_name, frame_num = null, extra_params = {}) {
  const response = await fetch('/im-vid-rendering/get_fps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: file_name,
      frame_num: frame_num,
      extra_params: extra_params,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch image data');
  }

  const result = await response.json();
  return result['result']['fps'];
}


async function render(file_name, frame_num = null, extra_params = {}) {
  const response = await fetch('/im-vid-rendering/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: file_name,
      frame_num: frame_num,
      extra_params: extra_params,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch image data');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}


async function render_file(file_name) {
  const response = await fetch('/im-vid-rendering/render_file', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: file_name
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch image data');
  }

  const blob = response.blob();
  return URL.createObjectURL(await blob);
}


