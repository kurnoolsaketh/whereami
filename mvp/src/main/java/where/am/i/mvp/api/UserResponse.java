package where.am.i.mvp.api;

import where.am.i.mvp.entities.User;

public record UserResponse(String userId, String firstName, String lastName) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getUserId(), user.getFirstName(), user.getLastName());
    }
}
