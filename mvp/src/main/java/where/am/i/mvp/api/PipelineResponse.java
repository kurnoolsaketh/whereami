package where.am.i.mvp.api;

import where.am.i.mvp.entities.Pipeline;

import java.util.List;

// the position, not the stage name, is what identifies where someone is: a pipeline may repeat
// a round, and the name alone cannot tell the first technical round from the second
public record PipelineResponse(List<Pipeline.Stage> stages, int currentStagePosition) {
    public static PipelineResponse from(Pipeline pipeline) {
        return new PipelineResponse(pipeline.getStages(), pipeline.getCurrentStagePosition());
    }
}
