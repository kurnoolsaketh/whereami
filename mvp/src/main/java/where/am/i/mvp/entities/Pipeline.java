package where.am.i.mvp.entities;

import java.io.IOException;
import java.util.*;

// one Pipeline per User per Job
public class Pipeline {
    List<Stage> stages;
    int position = 0;
    final Level level;
    final String jobId;
    Status status;

    public Pipeline(Level level, String jobId) {
        this.stages = new ArrayList<>();
        stages.add(Stage.APPLIED);
        this.level = level;
        this.jobId = jobId;
        this.status = Status.ACTIVE;
    }

    //TODO: every validation failure in mvp - here, in Pipeline.moveToStage, in User.getPipeline
    // and in both registries - is signalled with IOException, which is not an I/O condition.
    // Callers cannot tell a bad argument from a real read/write failure.
    public void updateStages(List<Stage> stages, int newPos) throws IOException {
        requireActive("change the stages of");
        if (stages.isEmpty()) {
            throw new IOException("Invalid stages - length must be greater than 0");
        }
        if (stages.getFirst() != Stage.APPLIED) {
            throw new IOException("First stage must be [%s]. Actual: [%s]".formatted(Stage.APPLIED, stages.getFirst()));
        }
        if (newPos < 0) {
            throw new IOException("Invalid position [%d] - must be greater than or equal to 0".formatted(newPos));
        }
        if (newPos >= stages.size()) {
            throw new IOException("Invalid position [%d] - max [%d]".formatted(newPos, stages.size()-1));
        }
        this.stages = new ArrayList<>(stages);
        this.position = newPos;
    }

    public void moveToStage(int newPos) throws IOException {
        requireActive("move");
        if (newPos < 0) {
            throw new IOException("Invalid position [%d] - must be greater than or equal to 0".formatted(newPos));
        }
        if (newPos >= stages.size()) {
            throw new IOException("Invalid position [%d] - max [%d]".formatted(newPos, stages.size()-1));
        }
        this.position = newPos;
    }

    public void updateStatus(Status newStatus) {
        this.status = newStatus;
    }

    // an application that ended is a record of what happened, so its rounds stop moving. this
    // guard lives here rather than in ApplicantService because status and stages are both
    // fields of this object - and ApplicantService.moveToNextStage delegates to moveToStage,
    // so guarding moveToStage and updateStages covers all three ways in.
    // reopening is unaffected: it is a status change, not a stage change
    private void requireActive(String action) throws IOException {
        if (status != Status.ACTIVE) {
            throw new IOException(
                    "Cannot %s an application that ended with [%s] - reopen it first".formatted(action, status));
        }
    }

    public Status getStatus() {
        return this.status;
    }

    public List<Stage> getStages() {
        return List.copyOf(stages);
    }

    public Stage getCurrentStage() {
        return stages.get(position);
    }

    public int getCurrentStagePosition() {
        return position;
    }

    public Level getLevel() {
        return level;
    }

    public String getJobId() {
        return jobId;
    }

    public enum Stage {
        APPLIED,
        RECRUITER_SCREEN,
        HIRING_MANAGER_SCREEN,
        TECHNICAL_ROUND,
        BEHAVIORAL_ROUND,
        ONSITE;
    }

    public enum Status {
        ACTIVE,
        USER_WITHDREW,
        OFFER,
        REJECTED;
    }
}
