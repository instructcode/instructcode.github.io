# comedy-joke-orbit




Cloudinary free tier (25GB storage, 25GB/month bandwidth) — upload images/videos, use the URL directly in mu field. Zero Netlify bandwidth.
	∙	GitHub raw URLs — https://raw.githubusercontent.com/you/repo/main/memes/dark/meme1.jpg — free, fast, reliable for images. Just commit your memes folder to a GitHub repo.
	∙	YouTube for video — always the right answer for comedy clips. Zero bandwidth anywhere.
Images load lazily — the browser only fetches them when they scroll into view. 100 images doesn’t mean 100 requests on load.


Data panel → ⬇ Export orbit-data.json
	3.	Upload orbit-data.json to Netlify alongside index.html
	4.	Every device that loads the app auto-fetches it on startup
Deletions work because the whole jokes array is replaced, not merged. It compares timestamps — if the file on Netlify is newer than what the device last saw, it loads it. If local localStorage is newer (you edited after the last upload), it keeps local. The ↑ Load orbit-data.json button forces a manual re-fetch.



