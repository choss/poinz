/**
 * user set his name
 */
import {modifyUser} from './roomModifiers';

const usernameSetEventHandler = (room, eventPayload, userId) => {
  return modifyUser(room, userId, (user) => ({
    ...user,
    username: eventPayload.username
  }));
};

export default usernameSetEventHandler;
