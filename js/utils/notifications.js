/**
 * notifications.js
 * Lightweight toast system shared by every module. No dependencies.
 */

let stackEl = null;

function getStack() {
  if (stackEl && document.body.contains(stackEl)) return stackEl;
  stackEl = document.createElement('div');
  stackEl.className = 'toast-stack';
  stackEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(stackEl);
  return stackEl;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [type]
 * @param {number} [duration] ms before auto-dismiss
 */
export function notify(message, type = 'info', duration = 4200) {
  const stack = getStack();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  const remove = () => {
    toast.style.transition = 'opacity 0.2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  };

  const timer = setTimeout(remove, duration);
  toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

export const notifySuccess = (msg, duration) => notify(msg, 'success', duration);
export const notifyError = (msg, duration) => notify(msg, 'error', duration);
export const notifyInfo = (msg, duration) => notify(msg, 'info', duration);
