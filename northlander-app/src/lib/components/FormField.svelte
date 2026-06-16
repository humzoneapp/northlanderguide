<script>
  /* Reusable labelled input. Used by the newsletter form, the
     advertiser sign-up, and any future App-side form that wants
     consistent labels, focus rings, error messaging, and field-level
     a11y wiring (aria-invalid + aria-describedby pointed at hint or
     error). Mirror the same shape if a Guide-side primitive ships;
     keep the markup intentionally boring so it composes inside any
     parent without a flex/grid surprise. */
  export let label;
  export let name;
  export let type = 'text';
  export let value = '';
  export let placeholder = '';
  export let required = false;
  export let autocomplete = '';
  export let inputmode = '';
  export let maxlength = undefined;
  /* error/hint are mutually exclusive in the rendered output; error
     wins when both are present. Both are simple strings - parents
     compose richer states themselves. */
  export let error = '';
  export let hint = '';
</script>

<div class="form-field" class:form-field-error={error}>
  <label class="form-label" for={name}>
    {label}{#if required}<span class="form-required" aria-hidden="true"> *</span>{/if}
  </label>
  <input
    class="form-input"
    id={name}
    {name}
    {type}
    bind:value
    {placeholder}
    autocomplete={autocomplete || undefined}
    inputmode={inputmode || undefined}
    {required}
    {maxlength}
    aria-invalid={error ? 'true' : 'false'}
    aria-describedby={error ? `${name}-error` : (hint ? `${name}-hint` : undefined)}
  />
  {#if hint && !error}
    <p id="{name}-hint" class="form-hint">{hint}</p>
  {/if}
  {#if error}
    <p id="{name}-error" class="form-error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 1rem;
  }
  .form-label {
    font-family: theme('fontFamily.sans');
    font-weight: 600;
    font-size: 0.85rem;
    color: theme('colors.ink');
    letter-spacing: 0.02em;
  }
  .form-required { color: theme('colors.rust'); }
  .form-input {
    font-family: theme('fontFamily.sans');
    font-size: 1rem;
    line-height: 1.4;
    padding: 0.6rem 0.8rem;
    background: theme('colors.cream');
    color: theme('colors.ink');
    border: 1px solid rgba(125, 58, 30, 0.25);
    border-radius: 8px;
    transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
  }
  .form-input::placeholder { color: theme('colors.muted'); opacity: 0.7; }
  .form-input:focus {
    outline: 0;
    border-color: theme('colors.rust');
    box-shadow: 0 0 0 3px rgba(125, 58, 30, 0.18);
  }
  .form-field-error .form-input {
    border-color: theme('colors.rust-d');
    background: #fff6f0;
  }
  .form-hint {
    font-size: 0.78rem;
    color: theme('colors.muted');
    margin: 0;
    line-height: 1.4;
  }
  .form-error {
    font-size: 0.82rem;
    color: theme('colors.rust-d');
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
  }
</style>
