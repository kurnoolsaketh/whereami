package where.am.i.mvp.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.entities.Pipeline;

import java.util.List;

// the stages a Pipeline can be made of, so the UI never hardcodes them
@RestController
@RequestMapping("/api/stages")
public class StageController {

    @GetMapping
    public List<Pipeline.Stage> listStages() {
        return List.of(Pipeline.Stage.values());
    }
}
