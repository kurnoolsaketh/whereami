package where.am.i.mvp.entities;

// TODO: flesh this out
public enum Level {
    NONE("None"),
    JUNIOR("Junior"),
    MID("Mid"),
    SENIOR("Senior"),
    STAFF("Staff"),
    PRINCIPAL("Principal"),
    DISTINGUISHED("Distinguished");

    private final String name;

    Level(String name) {
        this.name = name;
    }

    @Override
    public String toString() {
        return this.name;
    }
}
