package where.am.i.mvp.entities;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

// TODO: add more
public enum Role {
    SOFTWARE_ENGINEER("Software Engineer"),
    PRODUCT_MANAGER("Product Manager"),
    INTERNSHIP("Internship"),
    ENGINEERING_MANAGER("Engineering Manager");

    private final String name;
    private static final Map<String, Role> nameToRole = new HashMap<>();
    static {
        for (Role role : values()) {
            nameToRole.put(role.name, role);
        }
    }

    Role(String name) {
        this.name = name;
    }

    public static Role fromName(String roleName) throws IOException {
        if (!nameToRole.containsKey(roleName)) {
            throw new IOException("role [%s] not found".formatted(roleName));
        }
        return nameToRole.get(roleName);
    }

    @Override
    public String toString() {
        return this.name;
    }
}
