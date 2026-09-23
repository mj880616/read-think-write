# bokdoong-router deployment

`bokdoong-router.mjs` is the source of truth for the shared Cloudflare Worker that fronts
`read.bokdoong.com`, `work.bokdoong.com`, `desk.bokdoong.com`, and `arsenal.bokdoong.com`.

The GitHub Pages workflow does not deploy this Worker. After the change is merged to `main`
and the Pages workflow succeeds:

1. Run `npm test` and `node --check cloudflare/bokdoong-router.mjs` from the merged commit.
2. In Cloudflare Workers & Pages, open `bokdoong-router` and replace the Worker source with
   the merged `cloudflare/bokdoong-router.mjs` contents.
3. Use the Worker preview to check the read root, one SPA route, one existing static asset,
   one missing asset, and one non-read host before deploying.
4. Deploy, then repeat those checks against the live custom domains.

Do not deploy an unmerged local copy: the Worker and the repository must identify the same
source revision during rollback or incident review.
