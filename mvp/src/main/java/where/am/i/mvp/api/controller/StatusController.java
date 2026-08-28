package where.am.i.mvp.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.entities.Pipeline;

import java.util.List;

// how an application ended, or that it has not. separate from Stage, which is where someone
// stands: recording an outcome never touches the stage list. no toString override, so these
// travel as constant names and the UI titles them the way it titles stages
@RestController
@RequestMapping("/api/statuses")
public class StatusController {

    @GetMapping
    public List<Pipeline.Status> listStatuses() {
        return List.of(Pipeline.Status.values());
    }
}
