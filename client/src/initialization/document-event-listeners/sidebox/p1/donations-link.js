export const initializeDonationsLink = () => {
  const changelog = document.getElementById('changelog');
  const donationsPage = document.getElementById('donationsPage');

  const donationsLink = document.getElementById('donationsLink');
  donationsLink.addEventListener('click', () => {
    if (donationsPage.style.display === 'block') {
      donationsPage.style.display = 'none';
    } else {
      donationsPage.style.display = 'block';
      changelog.style.display = 'none';
    }
  });

  donationsPage.addEventListener('click', () => {
    if (donationsPage.style.display === 'block') {
      donationsPage.style.display = 'none';
    }
  });
};
