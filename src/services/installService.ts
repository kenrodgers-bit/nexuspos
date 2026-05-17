type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((listener) => listener(deferredPrompt));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  emit();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  emit();
});

export const installService = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(deferredPrompt);
    return () => listeners.delete(listener);
  },
  async prompt() {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    emit();
    return choice.outcome === 'accepted';
  },
  isStandalone() {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }
};
