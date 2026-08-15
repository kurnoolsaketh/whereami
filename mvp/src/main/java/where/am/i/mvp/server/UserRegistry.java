package where.am.i.mvp.server;

import where.am.i.mvp.entities.User;

import java.io.IOException;
import java.util.HashMap;

// TODO: should go in a database
public class UserRegistry {
    HashMap<String, User> userIdToApplicant;

    public UserRegistry() {
        this.userIdToApplicant = new HashMap<>();
    }

    public User createUser(String firstName, String lastName, String userId) throws IOException {
        if (userIdToApplicant.containsKey(userId)) {
            throw new IOException("User with id [%s] already exists".formatted(userId));
        }
        User user = new User(firstName, lastName, userId);
        userIdToApplicant.put(userId, user);
        return user;
    }

    public User getUser(String userId) throws IOException {
        if (userIdToApplicant.containsKey(userId)) {
            return userIdToApplicant.get(userId);
        }
        throw new IOException("No user found with id %s".formatted(userId));
    }
}
