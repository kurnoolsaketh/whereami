package where.am.i.mvp.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import where.am.i.mvp.api.response.ErrorResponse;

import java.io.IOException;

// the registries and the pipeline service signal every validation failure with IOException,
// so that is a bad request rather than a server error
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IOException.class)
    public ResponseEntity<ErrorResponse> handleValidationFailure(IOException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ErrorResponse(e.getMessage()));
    }
}
