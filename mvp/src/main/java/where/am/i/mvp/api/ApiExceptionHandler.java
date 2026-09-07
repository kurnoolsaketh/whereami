package where.am.i.mvp.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
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

    // a body Spring cannot parse - an unknown enum constant for a status, level or stage,
    // or malformed json - is rejected before the controller runs, so no IOException is ever
    // thrown and the response would otherwise carry Spring's default error body, which has no
    // `message` field. the frontend reads `message`, so without this the user gets a bare
    // "Request failed with status 400" whatever actually went wrong
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadableBody(HttpMessageNotReadableException e) {
        // deliberately not e.getMessage(): it carries Jackson's internals - class names and
        // JSON pointers - which tell a user nothing and describe the server's shape
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("Request body is missing, malformed, or has a value this API does not accept"));
    }
}
