export const initializeChangelog = () => {
  const donationsPage = document.getElementById('donationsPage');
  const changelog = document.getElementById('changelog');

  const changelogLink = document.getElementById('changelogLink');
  changelogLink.addEventListener('click', () => {
    if (changelog.style.display === 'block') {
      changelog.style.display = 'none';
    } else {
      changelog.style.display = 'block';
      donationsPage.style.display = 'none';
    }
  });

  changelog.addEventListener('click', () => {
    if (changelog.style.display === 'block') {
      changelog.style.display = 'none';
    }
  });
};
