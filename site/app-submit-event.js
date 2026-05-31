/* Standalone handler for the dedicated /submit-event/ page form.
   Shares the same /api/submit-event endpoint as the modal but binds
   to the *Page-suffixed input IDs. */

/* Inline client-side image resize: max 1200px long edge, JPEG 85%.
   Mirrors window.resizeEventImage in app.js so the dedicated page
   does not need to load the whole homepage bundle. */
async function resizeEventImagePage(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read image.'));
      i.src = url;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const max = 1200;
    if (w > max || h > max) {
      if (w >= h) { h = Math.round(h * max / w); w = max; }
      else { w = Math.round(w * max / h); h = max; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not encode image.');
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Could not encode image.'));
      fr.readAsDataURL(blob);
    });
    const filename = (file.name || 'event').replace(/\.[^.]+$/, '') + '.jpg';
    return { base64, contentType: 'image/jpeg', filename };
  } finally { URL.revokeObjectURL(url); }
}

(function(){
  const form = document.getElementById('evFormPage');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const human = $('evHumanPage'), consent = $('evConsentPage'), submit = $('evSubmitPage'), msg = $('evMsgPage');
  const fileEl = $('evImageFilePage');
  const fileLabel = $('evImageFileLabelPage');
  const fileClear = $('evImageFileClearPage');
  const filePreview = $('evImageFilePreviewPage');
  let imagePayload = null;

  function syncSubmit(){ submit.disabled = !(human.checked && consent.checked); }
  human.addEventListener('change', syncSubmit);
  consent.addEventListener('change', syncSubmit);

  fileEl.addEventListener('change', async () => {
    const f = fileEl.files && fileEl.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      msg.textContent = 'Please choose an image under 8 MB.';
      fileEl.value = '';
      return;
    }
    msg.textContent = 'Preparing image...';
    try {
      imagePayload = await resizeEventImagePage(f);
      filePreview.src = 'data:image/jpeg;base64,' + imagePayload.base64;
      filePreview.hidden = false;
      fileClear.hidden = false;
      fileLabel.textContent = 'Replace image';
      msg.textContent = '';
    } catch (err) {
      imagePayload = null;
      msg.textContent = 'Could not read that image. Try another.';
      fileEl.value = '';
    }
  });

  fileClear.addEventListener('click', () => {
    imagePayload = null;
    fileEl.value = '';
    filePreview.src = ''; filePreview.hidden = true;
    fileClear.hidden = true;
    fileLabel.textContent = 'Upload an image';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.classList.remove('ok');

    const payload = {
      name: $('evNamePage').value.trim(),
      stop: $('evStopPage').value,
      category: $('evCategoryPage').value,
      startDate: $('evStartDatePage').value,
      endDate: $('evEndDatePage').value,
      startTime: $('evStartTimePage').value.trim(),
      endTime: $('evEndTimePage').value.trim(),
      venue: $('evVenuePage').value.trim(),
      address: $('evAddressPage').value.trim(),
      description: $('evDescriptionPage').value.trim(),
      imageUrl: $('evImageUrlPage').value.trim(),
      eventUrl: $('evEventUrlPage').value.trim(),
      ticketUrl: $('evTicketUrlPage').value.trim(),
      price: $('evPricePage').value.trim(),
      free: $('evFreePage').checked,
      submittedBy: $('evSubmittedByPage').value.trim(),
      submitterEmail: $('evEmailPage').value.trim(),
      human: true, consent: true,
      url: $('evUrlPage').value
    };
    if (imagePayload) payload.image = imagePayload;

    if (!payload.name)         { msg.textContent = 'Event name is required.'; return; }
    if (!payload.stop)         { msg.textContent = 'Please pick a stop.'; return; }
    if (!payload.startDate)    { msg.textContent = 'Start date is required.'; return; }
    if (!payload.description)  { msg.textContent = 'Description is required.'; return; }
    if (!payload.submitterEmail){msg.textContent = 'Your email is required.'; return; }

    submit.disabled = true;
    msg.textContent = 'Submitting...';
    try {
      const res = await fetch('/api/submit-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        form.reset();
        fileClear.click();
        msg.classList.add('ok');
        msg.textContent = 'Thank you. Your event has been submitted for review.';
        submit.disabled = true;
      } else {
        let data = {};
        try { data = await res.json(); } catch(e){}
        msg.textContent = data.error || 'Could not submit right now. Please try again later.';
        submit.disabled = false;
      }
    } catch (err) {
      msg.textContent = 'Could not submit right now. Please try again later.';
      submit.disabled = false;
    }
  });
})();
