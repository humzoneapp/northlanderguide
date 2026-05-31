/* Standalone handler for the dedicated /submit-event/ page form.
   Shares the same /api/submit-event endpoint as the modal but binds
   to the *Page-suffixed input IDs. */
(function(){
  const form = document.getElementById('evFormPage');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const human = $('evHumanPage'), consent = $('evConsentPage'), submit = $('evSubmitPage'), msg = $('evMsgPage');

  function syncSubmit(){ submit.disabled = !(human.checked && consent.checked); }
  human.addEventListener('change', syncSubmit);
  consent.addEventListener('change', syncSubmit);

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
