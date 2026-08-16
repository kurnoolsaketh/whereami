package where.am.i.mvp.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.server.UserRegistry;

import java.io.IOException;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserRegistry userRegistry;

    public UserController(UserRegistry userRegistry) {
        this.userRegistry = userRegistry;
    }

    @PostMapping
    public UserResponse createUser(@RequestBody CreateUserRequest request) throws IOException {
        return UserResponse.from(
                userRegistry.createUser(request.firstName(), request.lastName(), request.userId()));
    }

    @GetMapping("/{userId}")
    public UserResponse getUser(@PathVariable String userId) throws IOException {
        return UserResponse.from(userRegistry.getUser(userId));
    }
}
