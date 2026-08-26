package where.am.i.mvp.api.request;

import where.am.i.mvp.entities.Pipeline;

import java.util.List;

// the list and the position travel together because PipelineService.updateStages validates the
// position against the incoming list - the user says where they stand as part of the same save
public record UpdateStagesRequest(List<Pipeline.Stage> stages, int currentStagePosition) {
}
