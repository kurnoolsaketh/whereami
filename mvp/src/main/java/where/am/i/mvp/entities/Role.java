package where.am.i.mvp.entities;

// TODO: add more
public enum Role {
    SOFTWARE_ENGINEER("Software Engineer"),
    PRODUCT_MANAGER("Product Manager"),
    INTERNSHIP("Internship"),
    ENGINEERING_MANAGER("Engineering Manager");

    private final String name;

    Role(String name) {
        this.name = name;
    }

    @Override
    public String toString() {
        return this.name;
    }
}
