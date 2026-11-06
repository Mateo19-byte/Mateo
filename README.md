# Mateo

Mateo is a static search homepage. Searches redirect to Google, while the theme, search history, suggestions, and quick links run in the browser.

## Publish with GitHub Pages

1. Install Git for Windows if it is not already installed.
2. Create a **public** repository on GitHub (for example, `mateo`).
3. Open PowerShell in this project folder and run the following, replacing `YOUR-USERNAME` with your GitHub username:

   ```powershell
   git init -b main
   git add index.html index.css index.js README.md .github/workflows/pages.yml
   git commit -m "Prepare Mateo for GitHub Pages"
   git remote add origin https://github.com/YOUR-USERNAME/mateo.git
   git push -u origin main
   ```

4. On GitHub, open the repository's **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
5. Open the **Actions** tab and wait for **Deploy Mateo to GitHub Pages** to finish. GitHub will show the public URL in **Settings → Pages**.

Future pushes to `main` automatically redeploy the site. The workflow publishes only `index.html`, `index.css`, and `index.js`.
