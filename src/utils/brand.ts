export const DEFAULT_LOGO_SRC = '/icons/logo.png';

export const logoSrc = (logo?: string | null) => {
  const value = logo?.trim();
  return value || DEFAULT_LOGO_SRC;
};
