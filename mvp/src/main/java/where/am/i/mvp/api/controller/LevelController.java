package where.am.i.mvp.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import where.am.i.mvp.entities.Level;

import java.util.List;

// the levels an application can be recorded at, so the UI never hardcodes them. Level overrides
// toString, so these travel as display names - "Senior", never "SENIOR"
@RestController
@RequestMapping("/api/levels")
public class LevelController {

    @GetMapping
    public List<Level> listLevels() {
        return List.of(Level.values());
    }
}
