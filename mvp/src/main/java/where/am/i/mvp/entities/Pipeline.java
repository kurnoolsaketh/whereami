package where.am.i.mvp.entities;

import java.io.IOException;
import java.util.*;

// one Pipeline per User per Job
public class Pipeline {
    List<Stage> stages;
    int position = 0;
    final Level level;

    public Pipeline(Level level) {
        this.stages = new ArrayList<>();
        stages.add(Stage.APPLIED);
        this.level = level;
    }

    //TODO: every validation failure in mvp - here, in Pipeline.moveToStage, in User.getPipeline
    // and in both registries - is signalled with IOException, which is not an I/O condition.
    // Callers cannot tell a bad argument from a real read/write failure.
    public void updateStages(List<Stage> stages, int newPos) throws IOException {
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
        if (newPos < 0) {
            throw new IOException("Invalid position [%d] - must be greater than or equal to 0".formatted(newPos));
        }
        if (newPos >= stages.size()) {
            throw new IOException("Invalid position [%d] - max [%d]".formatted(newPos, stages.size()-1));
        }
        this.position = newPos;
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

    public enum Stage {
        APPLIED,
        RECRUITER_SCREEN,
        HIRING_MANAGER_SCREEN,
        TECHNICAL_ROUND,
        BEHAVIORAL_ROUND,
        ONSITE,
        OFFER;
    }
}
