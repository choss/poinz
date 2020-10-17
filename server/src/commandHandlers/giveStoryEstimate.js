/**
 * A user gives his estimation for a certain story.
 * Users may only give estimations for the currently selected story.
 * A user that is marked as excluded (see toggleExclude/excludedFromEstimations)  cannot give estimations
 * As soon as all users (that can estimate) estimated the story, a "revealed" event is produced
 */
import {getMatchingStoryOrThrow, getMatchingUserOrThrow} from './commonPreconditions';

const schema = {
  allOf: [
    {
      $ref: 'command'
    },
    {
      properties: {
        payload: {
          type: 'object',
          properties: {
            storyId: {
              type: 'string',
              minLength: 1
            },
            value: {
              type: 'number'
            }
          },
          required: ['storyId', 'value'],
          additionalProperties: false
        }
      }
    }
  ]
};

const giveStoryEstimateCommandHandler = {
  schema,
  preCondition: (room, command, userId) => {
    const storyId = command.payload.storyId;

    if (room.selectedStory !== storyId) {
      throw new Error('Can only give estimation for currently selected story!');
    }

    const matchingStory = getMatchingStoryOrThrow(room, storyId);
    if (matchingStory.revealed) {
      throw new Error('You cannot give an estimate for a story that was revealed!');
    }

    const matchingUser = getMatchingUserOrThrow(room, userId);
    if (matchingUser.excluded) {
      throw new Error('Users that are excluded from estimations cannot give estimations!');
    }
  },
  fn: (room, command, userId) => {
    // currently estimation value is also sent to clients (hidden there)
    // user could "sniff" network traffic and see estimations of colleagues...
    // this could be improved in the future.. (e.g. not send value with "storyEstimateGiven" -> but send all values later with "revealed" )
    room.applyEvent('storyEstimateGiven', command.payload);

    const matchingStory = getMatchingStoryOrThrow(room, command.payload.storyId);

    if (allValidUsersEstimated(room, matchingStory, userId)) {
      room.applyEvent('revealed', {
        storyId: command.payload.storyId,
        manually: false
      });

      if (allEstimationsSame(room, matchingStory, userId, command.payload.value)) {
        room.applyEvent('consensusAchieved', {
          storyId: command.payload.storyId,
          value: command.payload.value
        });
      }
    }
  }
};

/**
 * Checks if every user in the room (that is not marked as excluded and is not disconnected) did give an estimate for the specified story
 *
 * @param room
 * @param matchingStory
 * @param userId
 * @returns {boolean}
 */
function allValidUsersEstimated(room, matchingStory, userId) {
  const possibleEstimationCount = countAllUsersThatCanEstimate(room);

  const estimations = {
    ...matchingStory.estimations,
    // set our user's estimation manually for counting (the actual value does not matter)
    // our estimation might be already set from a previous "giveStoryEstimate" commands.
    // so you cannot just add +1 to the count!
    [userId]: -1
  };
  const estimationCount = Object.values(estimations).length;

  return estimationCount === possibleEstimationCount;
}

/**
 * Checks whether all estimations for the specified story in the room have the same value and match specified "ownEstimate"
 *
 * @param {object} room
 * @param {string} matchingStory
 * @param {string} userId
 * @param {number} ownEstimate
 * @return {boolean}
 */
function allEstimationsSame(room, matchingStory, userId, ownEstimate) {
  const estimations = {
    ...matchingStory.estimations,
    // Add our user's estimation manually to the estimationMap (since event will be applied later)
    [userId]: ownEstimate
  };

  const estimationValues = Object.values(estimations);
  const firstValue = estimationValues[0];

  return estimationValues.every((est) => est === firstValue);
}

const countAllUsersThatCanEstimate = (room) =>
  Object.values(room.users || {})
    .filter((usr) => !usr.excluded)
    .filter((usr) => !usr.disconnected).length;

export default giveStoryEstimateCommandHandler;
