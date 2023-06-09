const core = require("@actions/core");
const github = require("@actions/github");

const githubToken = core.getInput("github_token");
const GITHUB_DONE_COLUMN_ID = core.getInput("github_done_column_id");
const GITHUB_RELEASE_NAME = core.getInput("github_release_name");

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

const listCardsParameters = {
  archived_state: "not_archived",
  column_id: GITHUB_DONE_COLUMN_ID,
  per_page: 50,
  mediaType: {
    previews: ["inertia"],
  },
};

const main = async () => {
  const octokit = github.getOctokit(githubToken);

  const issuesInMilestone = [];

  try {
    // Fetch all issues in the milestone to later compare with
    // issues associated with unarchived project cards.

    core.info(`repo:${owner}/${repo} milestone:${GITHUB_RELEASE_NAME}`);

    await octokit.paginate(
      octokit.rest.search.issuesAndPullRequests,
      {
        q: `repo:${owner}/${repo} milestone:${GITHUB_RELEASE_NAME}`,
        per_page: 50,
      },
      (response) =>
        issuesInMilestone.push(
          ...response.data.map((issue) => String(issue.number))
        )
    );
  } catch (error) {
    core.setFailed(
      `Error fetching issues and pull requests in milestone (${GITHUB_RELEASE_NAME}): ${error}`
    );
  }

  core.info(
    `Found ${issuesInMilestone.length} issues in milestone (${GITHUB_RELEASE_NAME})`
  );

  let cardToIssueNumbers = [];

  try {
    // Fetch all unarchived project cards and keep only those that
    // are associated with issues in the release milestone.

    await octokit.paginate(
      octokit.rest.projects.listCards,
      listCardsParameters,
      (response) => {
        cardToIssueNumbers = response.data
          .filter((card) => card.content_url != null)
          .map((card) => {
            const urlSegments = card.content_url.split("/");
            const issueNumber = urlSegments[urlSegments.length - 1];
            return [card.id, issueNumber];
          });
      }
    );
  } catch (error) {
    core.setFailed(`Error retrieving cards by release issues: ${error}`);
  }

  core.info(
    `Found ${cardToIssueNumbers.length} cards in column (${GITHUB_DONE_COLUMN_ID})`
  );

  const cardsToArchive = cardToIssueNumbers.filter((tuple) =>
    issuesInMilestone.includes(tuple[1])
  );

  core.info(`Found ${cardsToArchive.length} cards in milestone to archive`);

  if (cardsToArchive.length > 0) {
    const archive = [];
    for (let i = 0; i < cardsToArchive.length; i += 1) {
      const cardId = cardsToArchive[i][0];

      archive.push(
        octokit.projects.updateCard({
          card_id: cardId,
          archived: true,
        })
      );
    }
    try {
      await Promise.all(archive);
    } catch (error) {
      core.setFailed(`Error archiving cards: ${error}`);
    }
  }
};

main();
