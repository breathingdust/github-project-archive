const core = require('@actions/core');
const { Octokit } = require('@octokit/action');

const GITHUB_DONE_COLUMN_ID = core.getInput('github_done_column_id');
const GITHUB_RELEASE_NAME = core.getInput('github_release_name');

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

const listCardsParameters = {
  archived_state: 'not_archived',
  column_id: GITHUB_DONE_COLUMN_ID,
  per_page: 50,
  mediaType: {
    previews: [
      'inertia'
    ]
  }
}

const main = async () => {
  const octokit = new Octokit();

  let issuesInMilestone = []

  try {
    // Fetch all issues in the milestone to later compare with 
    // issues associated with unarchived project cards.

    for await(const response of octokit.paginate.iterator(
        octokit.rest.search.issuesAndPullRequests,
        {
          q: `repo:${owner}/${repo}+milestone:${GITHUB_RELEASE_NAME}`,
          per_page: 50,
        }
    )) {
      issuesInMilestone.push(...response.data.map(issue => String(issue.number)))
    }
  } catch(error) {
    core.setFailed(`Error fetching issues and pull requests in milestone (${GITHUB_RELEASE_NAME}): ${error}`)
  }

  core.info(`Found ${issuesInMilestone.length} issues in milestone (${GITHUB_RELEASE_NAME})`)

  try {
    // Fetch all unarchived project cards and keep only those that
    // are associated with issues in the release milestone.
    for await(const response of octokit.paginate.iterator(
      octokit.projects.listCards,
      listCardsParameters
    )) {
      let cardToIssueNumbers = response.data.filter(card => card.content_url != null).map(card => {
        const urlSegments = card.content_url.split('/')
        const issueNumber = urlSegments[urlSegments.length - 1]
        return [card.id, issueNumber]
      })
      
      let cardsToArchive = cardToIssueNumbers.filter(tuple => issuesInMilestone.includes(tuple[1]))

      if (cardsToArchive.length > 0) {
        core.info(`Found ${cardsToArchive.length} cards in milestone to archive`)
        
        for (let i = 0; i < cardsToArchive.length; i++) {
          let cardId = cardsToArchive[i][0]
          
          try {
            const resp = await octokit.projects.updateCard({
              card_id: cardId,
              archived: true,
            });

            if (resp.status == 200) {
              core.info(`Successfully archived project card: ${cardId}`)
            } else {
              core.info(`Request to archive project card (${cardId}) returned status: ${resp.status} `)
            }
          } catch (error) {
              core.setFailed(`Error archiving project card (${cardId}): ${error}`);
          }
        }
      }
    }
  } catch(error) {
    core.setFailed(`Error attempting to archive project cards in milestone (${GITHUB_RELEASE_NAME}): ${error}`);
  }
}

main()