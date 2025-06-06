interface TelegramWebApp {
  initDataUnsafe?: {
    start_param?: string;
  };
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
