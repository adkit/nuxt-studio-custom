# AdKit changes to Nuxt Studio

Base release: Nuxt Studio 1.8.0. Our first release is 1.8.0-adkit.1.

| What we changed | Why | How to check it |
| --- | --- | --- |
| Save Icon and CodeIcon inline in Markdown table cells. Reopen them as editable icons. | Studio could write block syntax in a table and then reject the file it had just saved. | Insert an icon before a platform name. Publish, reopen, change the icon, and save again. |
| Open the saved Markdown when a clean article differs from the preview. Keep existing browser edits. | The drafts site can still show an older build after Publish. | Reopen the article before the rebuild finishes. The editor and preview must show the saved text. |
| Preserve bound component props when updating the preview. | An icon grid with a list of items could stop the preview from rendering. | Reopen an article with a grid and edit its text. Check the grid and the text. |
| Keep the latest editor input while converting a long article to Markdown. | Fast typing could leave the last characters out of the saved draft. | Type a sentence quickly. Check the preview, refresh the page, and verify the entire sentence. |
| Keep the current preview if an edit fails to write. | A separate delete and insert could clear the preview on failure ([upstream #606](https://github.com/nuxt-content/nuxt-studio/issues/606)). | Reject a replacement in SQLite and verify the previous article survives. |
| Omit the optional formatting prompt. | Formatting an untouched article can discard information. Writers only need to edit and review their changes. | Open an article with noncanonical Markdown and edit it without a conversion prompt. |
| Recover named icons from the broken block syntax Studio 1.8 wrote in table cells. | Old articles still showed literal markers after the writer for new icons was fixed. | Open the saved article, then save and reopen a copy with its logos and labels intact. |

## Release and update

Push a fix to `adkit-v1.8`. GitHub builds the module and browser editor, runs the tests, and publishes `nuxt-studio.tgz` only if they pass. The [latest release](https://github.com/adkit/nuxt-studio-custom/releases/latest) points to that commit. Each previous release keeps its own download URL.

To connect the hosted drafts site, configure the **AdKit CMS** application in Dokploy. Keep its existing Node setup and `npm ci` install step. Use the following build command after the existing Node PATH export:

```sh
curl -fLsS --retry 3 https://github.com/adkit/nuxt-studio-custom/releases/latest/download/nuxt-studio.tgz -o /tmp/adkit-studio.tgz &&
  npm install --no-save --workspace @adkit/web /tmp/adkit-studio.tgz &&
  npm run cms:build
```

Use a fresh Nixpacks build when redeploying the same AdKit commit. A cached Docker build step can skip the download. For a normal Deploy button that always checks the editor release, set `NIXPACKS_NO_CACHE=1` on the CMS application. This can make article rebuilds slower. To roll back the editor, use the download URL from a previous release and rebuild.

When Nuxt releases a new version, merge the release into an update branch and run the checks above. Remove each local fix once the official version passes its check. If a major update makes the merge impractical, start from that version and use this file to decide which fixes to reapply.

The fork also builds its module before its browser editor and stops on either build error. The client plugins declare their public Nuxt type. The media template resolves its helper inside the installed package so a build on another machine works.
