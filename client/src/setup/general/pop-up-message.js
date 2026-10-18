export const showPopup = (message, callback) => {
  const popup = document.createElement('div');
  popup.className = 'custom-popup';

  const popupContent = document.createElement('div');
  popupContent.className = 'popup-content';
  popupContent.textContent = message;

  const okButton = document.createElement('button');
  okButton.className = 'popup-button';
  okButton.textContent = 'OK';
  okButton.addEventListener('click', () => {
    document.body.removeChild(popup);
    if (callback) {
      callback();
    }
  });

  popupContent.appendChild(okButton);
  popup.appendChild(popupContent);

  document.body.appendChild(popup);
};
