let timer = 0;

export function showToast(text: string, ms = 1800): void {
  const el = document.getElementById('toast')!;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('show'), ms);
}
