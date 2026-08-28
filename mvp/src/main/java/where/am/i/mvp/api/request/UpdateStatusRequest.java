package where.am.i.mvp.api.request;

import where.am.i.mvp.entities.Pipeline;

public record UpdateStatusRequest(Pipeline.Status newStatus) {
}
