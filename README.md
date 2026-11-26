# Mateo

Mateo is a static search homepage with a resident assistant named **Astra**. Searches redirect to Google, while the theme, search history, suggestions, quick links, and conversation all run in the browser.

## Astra

Open her with the pill under the quick links or with **Ctrl + K**.

- **Ask anything.** Enter sends, Shift + Enter starts a new line, Esc closes the room.
- **Two ways to think.** Use the free cloud model with no account or key, or point Astra at any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, Ollama on your own machine).
- **Streaming answers.** Replies arrive as they are written. The optional reasoning strip shows the model thinking; code blocks get a Copy button.
- **Voice.** Astra can read replies aloud, sentence by sentence, and the microphone can replace typing in browsers that support speech recognition.
- **Search hand-off.** When a reply ends with `SEARCH: words`, the line becomes a button that runs the search on Mateo.
- **Works offline, honestly.** With no connection, Astra still handles exact arithmetic, the clock, and page commands through the local layer instead of pretending to reason.
- **Stays in your browser.** Settings and the conversation are kept in `localStorage`. A custom API key is sent only to the endpoint you configure.

The assistant lives in `assistant/`:

| File | Job |
| --- | --- |
| `persona.js` | Who Astra is and how she speaks |
| `brain.js` | Talks to the cloud or custom model |
| `store.js` | Saves settings and the conversation |
| `speech.js` | Voice and microphone |
| `markdown.js` | Renders replies safely as page elements |
| `messages.js` | Builds one conversation row |
| `local.js` | Arithmetic, clock, and offline answers |
| `astra.js` | Wires everything to the page |

## Publish with GitHub Pages

1. Install Git for Windows if it is not already installed.
2. Create a **public** repository on GitHub (for example, `mateo`).
3. Open PowerShell in this project folder and run the following, replacing `YOUR-USERNAME` with your GitHub username:

   ```powershell
   git init -b main
   git add index.html index.css index.js README.md .github/workflows/pages.yml assistant
   git commit -m "Add the Astra assistant to Mateo"
   git remote add origin https://github.com/YOUR-USERNAME/mateo.git
   git push -u origin main
   ```

4. On GitHub, open the repository's **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
5. Open the **Actions** tab and wait for **Deploy Mateo to GitHub Pages** to finish. GitHub will show the public URL in **Settings → Pages**.

Future pushes to `main` automatically redeploy the site. The workflow publishes `index.html`, `index.css`, `index.js`, and the `assistant/` folder.

## A note on the free model

The free source uses [Pollinations](https://pollinations.ai). It needs no account or key, but it is a third-party service: do not paste secrets into a conversation. For private or heavier use, switch to a custom endpoint in Astra's settings.
