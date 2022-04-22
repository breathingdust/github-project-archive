const core = require('@actions/core');
const { Octokit } = require('@octokit/action');

const GITHUB_DONE_COLUMN_ID = core.getInput('github_done_column_id');
const GITHUB_RELEASE_NAME = core.getInput('github_release_name');

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

async function main() {
  const octokit = new Octokit();

  let cards = [];

  try {
    const response = await octokit.request('GET /projects/columns/{column_id}/cards', {
      column_id: GITHUB_DONE_COLUMN_ID,
      mediaType: {
        previews: [
          'inertia',
        ],
      },
    });
    cards = response.data;
    core.info(`Found ${cards.length} cards in done column`);
  } catch (error) {
    core.setFailed('Error retrieving project cards in done column');
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (card.content_url) {
      const urlSegments = card.content_url.split('/');
      const issueNumber = urlSegments[urlSegments.length - 1];
      let issue = {};
      try {
        // eslint-disable-next-line no-await-in-loop
        const issueReponse = await octokit.rest.issues.get({
          owner,
          repo,
          issueNumber,
        });
        issue = issueReponse.data;
      } catch (error) {
        core.setFailed(`Error retrieving issue from card ${error}`);
      }

      
      // Skip issues with no assigned Milestone
      if (issue.milestone == null) {
        continue
      }

      if (issue.milestone.title === GITHUB_RELEASE_NAME) {
        core.info(`Issue ${issue.number} has been released`);
        try {
          // eslint-disable-next-line no-await-in-loop
          await octokit.rest.projects.updateCard({
            card_id: card.id,
            archived: true,
          });
        } catch (error) {
          core.setFailed(`Error archiving card ${error}`);
        }
      }
    }
  }
}

try {
  main();
} catch (error) {
  core.setFailed(error);
}
