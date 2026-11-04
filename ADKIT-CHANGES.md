# AdKit changes to Nuxt Studio

Base release: Nuxt Studio 1.8.0. Our first release is 1.8.0-adkit.1.

| What we changed | Why | How to check it |
| --- | --- | --- |
| Save Icon and CodeIcon inline in Markdown table cells. Reopen them as editable icons. | Studio could write block syntax in a table and then reject the file it had just saved. | Insert an icon before a platform name. Publish, reopen, change the icon, and save again. |
| Open the saved Markdown when a clean article differs from the preview. Keep existing browser edits. | The drafts site can still show an older build after Publish. | Reopen the article before the rebuild finishes. The editor and preview must show the saved text. |
| Preserve bound component props when updating the preview. | An icon grid with a list of items could stop the preview from rendering. | Reopen an article with a grid and edit its text. Check the grid and the text. |
| Keep the latest editor input while converting a long article to Markdown. | Fast typing could leave the last characters out of the saved draft. | Type a sentence quickly. Check the preview, refresh the page, and verify the entire sentence. |

## Release and update

Build the module and browser editor from the same commit. Attach the built npm tarball to the fork's GitHub release. AdKit installs that exact archive under the dependency name `nuxt-studio`.

When Nuxt releases a new version, merge the release into an update branch and run the checks above. Remove each local fix once the official version passes its check. If a major update makes the merge impractical, start from that version and use this file to decide which fixes to reapply.

The fork also builds its module before its browser editor and stops on either build error. The client plugins declare their public Nuxt type. The media template resolves its helper inside the installed package so a build on another machine works.
