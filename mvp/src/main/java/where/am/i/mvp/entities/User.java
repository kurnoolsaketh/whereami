package where.am.i.mvp.entities;

import java.io.IOException;
import java.nio.channels.Pipe;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public class User {
    String firstName;
    String lastName;
    String userId;
    Map<Job, Pipeline> activeJobToPipeline;

    public User(String firstName, String lastName, String userId) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.userId = userId;
        activeJobToPipeline = new HashMap<>();
    }

    public void addJob(Job job) {
        activeJobToPipeline.put(job, new Pipeline());
    }

    public void removeJob(Job job) {
        activeJobToPipeline.remove(job);
    }

    public Pipeline getPipeline(Job job) throws IOException {
        if (!activeJobToPipeline.containsKey(job)) {
            throw new IOException("User has not applied to the [%s] role at [%s] or has been removed".formatted(job.title, job.company));
        }
        return activeJobToPipeline.get(job);
    }

    public String getFirstName() {
        return firstName;
    }
    public String getLastName() {
        return lastName;
    }
    public String getUserId() {
        return userId;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof User other)) {
            return false;
        }

        return Objects.equals(this.firstName, other.firstName) &&
                Objects.equals(this.lastName, other.lastName) &&
                Objects.equals(this.userId, other.userId) &&
                Objects.equals(this.activeJobToPipeline, other.activeJobToPipeline);
    }
}
