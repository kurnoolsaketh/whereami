package where.am.i.mvp.entities;

import java.io.IOException;
import java.util.*;

// one Pipeline per User per Job
public class Pipeline {
    List<Stage> stages;
    int position = 0;

    public Pipeline() {
        this.stages = new ArrayList<>();
        stages.add(Stage.APPLIED);
    }

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

    public Stage getCurrentStage() {
        return stages.get(position);
    }

    public int getCurrentStagePosition() {
        return position;
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
