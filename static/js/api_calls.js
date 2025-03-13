
export async function fetch_image_data(file_name, frame_num = null, extra_params = {}) {
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
